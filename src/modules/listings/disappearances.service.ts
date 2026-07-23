import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { In, IsNull, LessThan, MoreThanOrEqual, Repository } from 'typeorm';

import { SearchProfile } from '../profiles/entities/search-profile.entity';

import {
  cohortKeyForListing,
  domDays,
  GRACE_HOURS,
  isRelistMatch,
  priceCutStats,
  profileCovers,
  RELIST_WINDOW_DAYS,
} from './disappearance';
import { DetectionMode, ListingDisappearance } from './entities/listing-disappearance.entity';
import { Listing } from './entities/listing.entity';
import { PriceObservation } from './entities/price-observation.entity';

/** Same dedup key as `ListingsService` — kept as a local constant so this service has no
 * dependency on that service (its repo surface is intentionally standalone, see FR-409). */
const SOURCE_KEY = 'auto-ria';

/** Cap on the `externalId IN (...)` list for the bulk sighting-bump update. */
const SIGHTING_BUMP_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Realized-"sale" event collection at zero API cost (spec 004, US4.1/4.2). Diffs each poll
 * cycle's seen-id set against `lastSeenInSearchAt`, applying eligibility/coverage/grace filters
 * before recording a disappearance. **Zero-API guarantee is structural (FR-409)**: this service
 * does not inject `LISTING_SOURCE` or anything source-related — it works from stored state only.
 */
@Injectable()
export class DisappearancesService {
  /** Process start time — candidates whose `disappearedAt` predates this by more than the grace
   * window are quarantined as `'backfill'` rather than `'live'` (initial-wave rows). */
  private readonly startedAt = new Date();

  constructor(
    @InjectRepository(Listing) private readonly listings: Repository<Listing>,
    @InjectRepository(PriceObservation) private readonly observations: Repository<PriceObservation>,
    @InjectRepository(ListingDisappearance)
    private readonly disappearances: Repository<ListingDisappearance>,
    @InjectPinoLogger(DisappearancesService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * One poll cycle's worth of disappearance bookkeeping: bump sightings, resurrect anything
   * that reappeared, then record disappearances for active listings that are absent beyond
   * grace and still covered by at least one eligible search profile. `graceHours` defaults to
   * the poll-cadence grace; the daily sweep passes `SWEEP_GRACE_HOURS` (FR-411).
   */
  async processCycle(
    seenExternalIds: Set<string>,
    eligibleProfiles: SearchProfile[],
    graceHours: number = GRACE_HOURS,
  ): Promise<ListingDisappearance[]> {
    const now = new Date();

    // 1. Sighting bump — always, even with zero eligible profiles (a sighting is a sighting).
    if (seenExternalIds.size > 0) {
      for (const ids of chunk([...seenExternalIds], SIGHTING_BUMP_CHUNK_SIZE)) {
        await this.listings.update(
          { sourceKey: SOURCE_KEY, externalId: In(ids) },
          { lastSeenInSearchAt: now },
        );
      }
    }

    // 2. Resurrection (FR-406): a previously-removed listing showed up again.
    const resurrectedCount = await this.resurrect(seenExternalIds, now);

    // 3. No eligible profiles this cycle → no candidates possible.
    if (eligibleProfiles.length === 0) {
      this.logger.debug('No eligible profiles this cycle — skipping disappearance detection');
      this.logger.info(
        {
          seen: seenExternalIds.size,
          resurrected: resurrectedCount,
          candidates: 0,
          covered: 0,
          recorded: 0,
        },
        'Disappearance cycle complete',
      );
      return [];
    }

    // 4. Candidates (FR-403): active, previously seen in search, absent beyond grace. Listings
    // just bumped to `now` above can never satisfy `< graceCutoff`, so they're excluded for free.
    const graceCutoff = new Date(now.getTime() - graceHours * 60 * 60 * 1000);
    const candidates = await this.listings.find({
      where: { status: 'active', lastSeenInSearchAt: LessThan(graceCutoff) },
    });

    // 5. Coverage filter (FR-403): keep only candidates at least one eligible profile still matches.
    const covered = candidates.filter((candidate) =>
      eligibleProfiles.some((profile) => profileCovers(profile, candidate)),
    );

    // 6. Record (FR-404/405), idempotently — one event per listing, ever.
    const recorded: ListingDisappearance[] = [];
    for (const listing of covered) {
      const event = await this.recordDisappearance(listing);
      if (event) recorded.push(event);
    }

    this.logger.info(
      {
        seen: seenExternalIds.size,
        resurrected: resurrectedCount,
        candidates: candidates.length,
        covered: covered.length,
        recorded: recorded.length,
      },
      'Disappearance cycle complete',
    );

    return recorded;
  }

  /** Reappeared listings: flip status back to active and void any open disappearance event. */
  private async resurrect(seenExternalIds: Set<string>, now: Date): Promise<number> {
    if (seenExternalIds.size === 0) return 0;

    const removed = await this.listings.find({
      where: { sourceKey: SOURCE_KEY, externalId: In([...seenExternalIds]), status: 'removed' },
    });
    if (removed.length === 0) return 0;

    for (const listing of removed) {
      listing.status = 'active';
      await this.listings.save(listing);
    }

    await this.disappearances.update(
      { listingId: In(removed.map((l) => l.id)), reappearedAt: IsNull() },
      { reappearedAt: now },
    );

    this.logger.info({ count: removed.length }, 'Resurrected listings that reappeared in search');
    return removed.length;
  }

  /** Insert a disappearance event for one candidate and flip it to removed. No-op (returns null)
   * if an event already exists — one row per listing, ever (idempotent re-runs). */
  private async recordDisappearance(listing: Listing): Promise<ListingDisappearance | null> {
    const existing = await this.disappearances.findOne({ where: { listingId: listing.id } });
    if (existing) return null;

    const observations = await this.observations.find({
      where: { listingId: listing.id },
      order: { observedAt: 'ASC' },
    });
    const lastKnownPriceUsd =
      observations.length > 0
        ? observations[observations.length - 1].amountUsd
        : listing.currentAmount;
    const { priceCutsCount, hadPriceCut } = priceCutStats(observations);

    // Non-null: candidates are queried with `lastSeenInSearchAt < graceCutoff`.
    const disappearedAt = listing.lastSeenInSearchAt as Date;
    const detectionMode: DetectionMode =
      disappearedAt.getTime() < this.startedAt.getTime() - GRACE_HOURS * 60 * 60 * 1000
        ? 'backfill'
        : 'live';

    const event = this.disappearances.create({
      listingId: listing.id,
      cohortKey: cohortKeyForListing(listing),
      lastKnownPriceUsd,
      firstSeenAt: listing.firstSeenAt,
      disappearedAt,
      domDays: domDays(listing.firstSeenAt, disappearedAt),
      priceCutsCount,
      hadPriceCut,
      detectionMode,
    });
    const saved = await this.disappearances.save(event);

    listing.status = 'removed';
    await this.listings.save(listing);

    return saved;
  }

  /**
   * FR-407: does `newListing` look like the same car as a recently-disappeared one? Marks the
   * first matching open (non-voided, not-yet-relist) event within the relist window and stops —
   * one event per new listing is enough.
   */
  async checkRelist(newListing: Listing): Promise<void> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - RELIST_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const candidates = await this.disappearances.find({
      where: {
        disappearedAt: MoreThanOrEqual(windowStart),
        isRelist: false,
        reappearedAt: IsNull(),
      },
    });
    const relevant = candidates.filter((event) => event.listingId !== newListing.id);
    if (relevant.length === 0) return;

    const prevListings = await this.listings.find({
      where: { id: In(relevant.map((event) => event.listingId)) },
    });
    const byListingId = new Map(prevListings.map((l) => [l.id, l]));

    for (const event of relevant) {
      const prev = byListingId.get(event.listingId);
      if (!prev) continue;
      if (!isRelistMatch(prev, newListing)) continue;

      event.isRelist = true;
      event.relistListingId = newListing.id;
      event.relistDetectedAt = now;
      await this.disappearances.save(event);
      this.logger.info(
        { prevListingId: prev.id, newListingId: newListing.id },
        'Relist detected',
      );
      return;
    }
  }
}
