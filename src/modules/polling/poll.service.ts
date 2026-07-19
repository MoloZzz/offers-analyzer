import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RateBudgetExhaustedError } from '../../common/errors/domain-error';
import { Currency } from '../../common/types/money';
import { OutcomesService } from '../calibration/outcomes.service';
import { ExchangeRate, EXCHANGE_RATE } from '../fx/ports/exchange-rate.port';
import { HealthService } from '../health/health.service';
import { Listing } from '../listings/entities/listing.entity';
import { ListingsService } from '../listings/listings.service';
import { AlertedCarsService } from '../notifications/alerted-cars.service';
import { NotificationsService } from '../notifications/notifications.service';
import { normalizeVin } from '../notifications/vin';
import { SearchProfile } from '../profiles/entities/search-profile.entity';
import { ProfilesService } from '../profiles/profiles.service';
import {
  ListingDetail,
  ListingSource,
  LISTING_SOURCE,
  SourceSearchQuery,
} from '../sources/ports/listing-source.port';
import { BenchmarkCacheService } from '../valuation/benchmark-cache.service';
import { resolveBenchmark } from '../valuation/cohort';
import { Opportunity } from '../valuation/entities/opportunity.entity';
import { MileageAdjuster } from '../valuation/mileage';
import { ValuationService } from '../valuation/valuation.service';

/** Cap new listings processed per profile per cycle so one profile can't hog the shared budget. */
const MAX_NEW_PER_PROFILE = 15;
/** How many already-seen listings to re-check per profile per cycle for price drops. */
const REOBSERVE_PER_CYCLE = 5;

/** A profile's per-cycle work: fresh listings to value, and known ones to re-check for price drops. */
interface ProfileQueue {
  profile: SearchProfile;
  newIds: string[];
  stale: Listing[];
}

/**
 * The MVP pipeline (US1): each cycle searches every enabled niche, then values fresh listings and
 * re-checks a few known ones for price drops (FR-009). Work is drained **round-robin** across profiles
 * so no single niche (e.g. a market-wide one) spends the whole ~30 req/hr budget before the others run.
 * Runs on a cron (no queue in v1); when the budget is exhausted (or the source returns HTTP 429) the
 * cycle stops cleanly and resumes next tick (FR-012).
 */
@Injectable()
export class PollService {
  private readonly logger = new Logger(PollService.name);

  constructor(
    private readonly profiles: ProfilesService,
    @Inject(LISTING_SOURCE) private readonly source: ListingSource,
    private readonly listings: ListingsService,
    private readonly valuation: ValuationService,
    private readonly benchmarks: BenchmarkCacheService,
    @InjectRepository(Opportunity) private readonly opportunities: Repository<Opportunity>,
    private readonly notifications: NotificationsService,
    @Inject(EXCHANGE_RATE) private readonly fx: ExchangeRate,
    private readonly mileage: MileageAdjuster,
    private readonly outcomes: OutcomesService,
    private readonly health: HealthService,
    private readonly alertedCars: AlertedCarsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async poll(): Promise<void> {
    try {
      await this.runCycle();
      this.health.markPollSuccess();
    } catch (err) {
      this.health.markPollFailure();
      this.logger.error('Poll cycle failed', err as Error);
    }
  }

  private async runCycle(): Promise<void> {
    const profiles = await this.profiles.getEnabled();

    // Phase 1 — one search per profile; build a per-profile work queue (dedup + per-profile cap).
    const queues: ProfileQueue[] = [];
    for (const profile of profiles) {
      try {
        const { ids } = await this.source.search(toQuery(profile));
        const known = await this.listings.findByExternalIds(ids);
        const knownIds = new Set(known.map((l) => l.externalId));
        const newIds = ids.filter((id) => !knownIds.has(id)).slice(0, MAX_NEW_PER_PROFILE);
        // Never-scored listings first (a prior cycle likely hit the budget limit mid-evaluation),
        // then oldest-seen — so nothing stays unscored forever.
        const stale = [...known]
          .sort((a, b) => {
            const aUnscored = a.lastScore == null ? 0 : 1;
            const bUnscored = b.lastScore == null ? 0 : 1;
            if (aUnscored !== bUnscored) return aUnscored - bUnscored;
            return a.lastSeenAt.getTime() - b.lastSeenAt.getTime();
          })
          .slice(0, REOBSERVE_PER_CYCLE);
        queues.push({ profile, newIds, stale });
      } catch (err) {
        if (err instanceof RateBudgetExhaustedError) return; // budget gone — resume next tick
        this.logger.error(`Search failed for profile ${profile.id}`, err as Error);
      }
    }

    // Phase 2 — new listings first (that's where fresh deals are), fairly across profiles.
    const exhausted = await this.drainRoundRobin(
      queues,
      (q) => q.newIds,
      (profile, externalId) => this.processNew(profile, externalId),
    );
    if (exhausted) return;

    // Phase 3 — re-observe known listings for price drops (and score any never-scored), budget permitting.
    await this.drainRoundRobin(
      queues,
      (q) => q.stale,
      (profile, listing) => this.reobserve(profile, listing),
    );
  }

  /**
   * Take one item from each profile's queue in turn until all are empty. A budget-exhausted error
   * stops the whole cycle (returns true); any other per-item error just skips that item.
   */
  private async drainRoundRobin<T>(
    queues: ProfileQueue[],
    pick: (q: ProfileQueue) => T[],
    handle: (profile: SearchProfile, item: T) => Promise<void>,
  ): Promise<boolean> {
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const q of queues) {
        const items = pick(q);
        if (items.length === 0) continue;
        progressed = true;
        const item = items.shift() as T;
        try {
          await handle(q.profile, item);
        } catch (err) {
          if (err instanceof RateBudgetExhaustedError) return true;
          this.logger.warn(`Skipping item for profile ${q.profile.id}: ${(err as Error).message}`);
        }
      }
    }
    return false;
  }

  private async processNew(profile: SearchProfile, externalId: string): Promise<void> {
    const detail = await this.source.fetch(externalId);
    if (profile.dealerPolicy === 'exclude' && detail.sellerType === 'dealer') return;
    if (isExcluded(profile, detail)) return;
    const { listing } = await this.listings.recordSeen(detail);
    await this.evaluateAndNotify(profile, detail, listing, 'opportunity', null);
  }

  private async reobserve(profile: SearchProfile, existing: Listing): Promise<void> {
    const previousAmount = existing.currentAmount;
    const detail = await this.source.fetch(existing.externalId);
    if (isExcluded(profile, detail)) return;
    const { listing } = await this.listings.recordSeen(detail);
    // Evaluate on a price drop, OR if this listing was never scored (e.g. a prior cycle ran out of
    // budget before scoring it). Otherwise the recorded observation is enough.
    const dropped = detail.price.amount < previousAmount;
    // Passive outcome (spec 002 E2c): the listing got cheaper — a weak "the market moved" signal.
    if (dropped) {
      await this.outcomes.recordPassive({ listingId: listing.id, label: 'price_dropped' });
    }
    if (!dropped && existing.lastScore != null) return;
    await this.evaluateAndNotify(
      profile,
      detail,
      listing,
      dropped ? 'price_drop' : 'opportunity',
      dropped ? previousAmount : null,
    );
  }

  private async evaluateAndNotify(
    profile: SearchProfile,
    detail: ListingDetail,
    listing: Listing,
    type: 'opportunity' | 'price_drop',
    previousAmount: number | null,
  ): Promise<void> {
    const benchmark = await resolveBenchmark(this.source, this.benchmarks, detail);
    const fairValue = benchmark ? this.mileage.fairValue(benchmark, detail) : 0;
    const sampleSize = benchmark?.sampleSize ?? 0;

    const result = this.valuation.evaluate({
      asking: detail.price.amount,
      fairValue,
      sampleSize,
      minScore: profile.minDealScore,
      minSamples: profile.confidenceMinSamples,
      make: detail.make,
      model: detail.model,
      sellerType: detail.sellerType,
      hasVinReport: detail.hasVinReport,
      damaged: detail.risk.damaged,
      salvage: detail.risk.salvage,
      unclearCustoms: detail.risk.unclearCustoms,
      confiscated: detail.risk.confiscated,
      underCredit: detail.risk.underCredit,
      abroad: detail.risk.abroad,
      description: detail.description,
      mileageK: detail.mileage,
      year: detail.year,
      vinChecked: detail.risk.vinChecked,
    });

    await this.listings.recordEvaluation(listing, result.score, result.discountPct, profile.id);
    if (!result.isOpportunity) return;

    // Relist de-dup (B12): don't re-alert the same car (by VIN) unless it's now cheaper than the
    // lowest we ever alerted. No VIN → no cross-listing de-dup (behaves as before).
    const carKey = normalizeVin(detail.vin);
    if (carKey) {
      const decision = await this.alertedCars.decideAndRecord(carKey, detail.price.amount, listing.id);
      if (decision === 'suppress') return;
    }

    // Comparison ran in USD (ratios are currency-agnostic); store amounts in the profile's currency.
    const rate = await this.fx.rate(Currency.USD, profile.currency);
    const opportunity = await this.opportunities.save(
      this.opportunities.create({
        listingId: listing.id,
        profileId: profile.id,
        fairValue: Math.round(fairValue * rate),
        currency: profile.currency,
        askingValue: Math.round(detail.price.amount * rate),
        discountPct: result.discountPct,
        confidence: result.confidence,
        score: result.score,
        redFlags: result.redFlags,
        notified: false,
      }),
    );

    if (type === 'price_drop' && previousAmount != null) {
      await this.notifications.notifyPriceDrop(opportunity, listing, Math.round(previousAmount * rate));
    } else {
      await this.notifications.notifyOpportunity(opportunity, listing);
    }
    opportunity.notified = true;
    await this.opportunities.save(opportunity);
  }
}

function toQuery(p: SearchProfile): SourceSearchQuery {
  return {
    categoryId: p.categoryId,
    stateId: p.stateId ?? undefined,
    cityId: p.cityId ?? undefined,
    makeModelPairs: p.filters.makeModelPairs,
    yearFrom: p.filters.yearFrom,
    yearTo: p.filters.yearTo,
    priceFrom: p.priceFrom ?? undefined,
    priceTo: p.priceTo ?? undefined,
    mileageFrom: p.filters.mileageFrom,
    mileageTo: p.filters.mileageTo,
    submittedWithin: p.filters.submittedWithin,
  };
}

function isExcluded(profile: SearchProfile, detail: ListingDetail): boolean {
  const exclude = profile.filters.excludeMakeModels;
  if (!exclude || exclude.length === 0) return false;
  const makeModel = `${detail.make} ${detail.model}`.toLowerCase();
  return exclude.some((e) => makeModel.includes(e.toLowerCase()));
}
