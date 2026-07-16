import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

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

  async recordSeen(detail: ListingDetail): Promise<RecordResult> {
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
        currentAmount: detail.price.amount,
        currentCurrency: detail.price.currency,
        status: 'active',
        lastSeenAt: now,
      });
    } else {
      priceChanged = listing.currentAmount !== detail.price.amount;
      listing.currentAmount = detail.price.amount;
      listing.currentCurrency = detail.price.currency;
      listing.lastSeenAt = now;
    }

    const saved = await this.listings.save(listing);

    if (isNew || priceChanged) {
      await this.observations.save(
        this.observations.create({
          listingId: saved.id,
          amount: detail.price.amount,
          currency: detail.price.currency,
          // FX normalization is US2; in v1 the compare currency is USD, so amountUsd === amount.
          amountUsd: detail.price.currency === Currency.USD ? detail.price.amount : detail.price.amount,
        }),
      );
    }

    return { listing: saved, isNew, priceChanged };
  }

  /** Record the latest valuation on the listing — for every evaluated listing, not just opportunities. */
  async recordEvaluation(listing: Listing, score: number, discountPct: number): Promise<void> {
    listing.lastScore = score;
    listing.lastDiscountPct = discountPct;
    listing.lastEvaluatedAt = new Date();
    await this.listings.save(listing);
  }
}
