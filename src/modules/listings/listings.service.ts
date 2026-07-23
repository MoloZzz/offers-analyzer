import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';

import { Currency } from '../../common/types/money';
import { ListingDetail } from '../sources/ports/listing-source.port';

import { Listing } from './entities/listing.entity';
import { PriceObservation } from './entities/price-observation.entity';

export interface RecordResult {
  listing: Listing;
  isNew: boolean;
  priceChanged: boolean;
}

/** Persists listings and their price history; enforces dedup by (sourceKey, externalId) — FR-008/011. */
@Injectable()
export class ListingsService {
  private readonly sourceKey = 'auto-ria';

  constructor(
    @InjectRepository(Listing) private readonly listings: Repository<Listing>,
    @InjectRepository(PriceObservation) private readonly observations: Repository<PriceObservation>,
  ) {}

  async isKnown(externalId: string): Promise<boolean> {
    const count = await this.listings.count({ where: { sourceKey: this.sourceKey, externalId } });
    return count > 0;
  }

  /** Return the already-known listings among the given external ids (for dedup + re-observation). */
  findByExternalIds(externalIds: string[]): Promise<Listing[]> {
    if (externalIds.length === 0) return Promise.resolve([]);
    return this.listings.find({
      where: { sourceKey: this.sourceKey, externalId: In(externalIds) },
    });
  }

  /** Return listings by internal id (for joining opportunities to their listing). */
  findByIds(ids: string[]): Promise<Listing[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.listings.find({ where: { id: In(ids) } });
  }

  /** Best-scoring evaluated listings (even below the alert threshold) — the "best available now". */
  topByScore(limit = 5): Promise<Listing[]> {
    return this.listings.find({
      where: { lastScore: Not(IsNull()) },
      order: { lastScore: 'DESC' },
      take: limit,
    });
  }

  /** Recently evaluated listings (for /last command). */
  getRecentlyEvaluated(limit = 10): Promise<Listing[]> {
    return this.listings.find({
      where: { lastScore: Not(IsNull()), lastEvaluatedAt: Not(IsNull()) },
      order: { lastEvaluatedAt: 'DESC' },
      take: limit,
    });
  }

  /** All recorded deal scores (for the self-tuning report / calibration) — optionally per profile. */
  async scoresForReport(profileId?: string): Promise<number[]> {
    const qb = this.listings
      .createQueryBuilder('l')
      .select('l.lastScore', 'lastScore')
      .where('l.lastScore IS NOT NULL');
    if (profileId) qb.andWhere('l.profileId = :profileId', { profileId });
    const rows = await qb.getRawMany<{ lastScore: string }>();
    return rows.map((r) => Number(r.lastScore)).filter((n) => Number.isFinite(n));
  }

  /** Listings scored just below the alert threshold — the "almost made it" near-misses (R1). */
  nearMisses(min: number, maxExclusive: number, limit = 5): Promise<Listing[]> {
    return this.listings
      .createQueryBuilder('l')
      .where('l.lastScore >= :min AND l.lastScore < :max', { min, max: maxExclusive })
      .orderBy('l.lastScore', 'DESC')
      .limit(limit)
      .getMany();
  }

  async recordSeen(
    detail: ListingDetail,
    opts?: { seenInSearch?: boolean },
  ): Promise<RecordResult> {
    const now = new Date();
    let listing = await this.listings.findOne({
      where: { sourceKey: this.sourceKey, externalId: detail.externalId },
    });
    const isNew = listing === null;
    let priceChanged = false;

    if (listing === null) {
      listing = this.listings.create({
        sourceKey: this.sourceKey,
        externalId: detail.externalId,
        make: detail.make,
        model: detail.model,
        markId: detail.markId,
        modelId: detail.modelId,
        year: detail.year,
        mileage: detail.mileage ?? null,
        stateId: detail.stateId ?? null,
        cityId: detail.cityId ?? null,
        sellerType: detail.sellerType,
        vin: detail.vin ?? null,
        url: detail.url,
        description: detail.description ?? null,
        currentAmount: detail.price.amount,
        currentCurrency: detail.price.currency,
        status: 'active',
        lastSeenAt: now,
      });
    } else {
      priceChanged = listing.currentAmount !== detail.price.amount;
      listing.currentAmount = detail.price.amount;
      listing.currentCurrency = detail.price.currency;
      if (detail.description != null) listing.description = detail.description;
      listing.lastSeenAt = now;
    }
    // A fetch triggered by this cycle's search results is also a search sighting (SPEC-004
    // FR-401) — without this, a fast-selling listing created mid-cycle would have no sighting
    // timestamp and could never be detected as disappeared.
    if (opts?.seenInSearch) listing.lastSeenInSearchAt = now;

    const saved = await this.listings.save(listing);

    if (isNew || priceChanged) {
      await this.observations.save(
        this.observations.create({
          listingId: saved.id,
          amount: detail.price.amount,
          currency: detail.price.currency,
          // FX normalization is US2; in v1 the compare currency is USD, so amountUsd === amount.
          amountUsd:
            detail.price.currency === Currency.USD ? detail.price.amount : detail.price.amount,
        }),
      );
    }

    return { listing: saved, isNew, priceChanged };
  }

  /** Record the latest valuation on the listing — for every evaluated listing, not just opportunities. */
  async recordEvaluation(
    listing: Listing,
    score: number,
    discountPct: number,
    profileId?: string | null,
  ): Promise<void> {
    listing.lastScore = score;
    listing.lastDiscountPct = discountPct;
    listing.lastEvaluatedAt = new Date();
    if (profileId != null) listing.profileId = profileId;
    await this.listings.save(listing);
  }
}
