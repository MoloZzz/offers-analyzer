import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppConfig } from '../../common/config/configuration';
import { Currency } from '../../common/types/money';
import { Listing } from '../listings/entities/listing.entity';
import { ListingsService } from '../listings/listings.service';
import {
  CohortQuery,
  ListingDetail,
  ListingSource,
  LISTING_SOURCE,
} from '../sources/ports/listing-source.port';
import { BenchmarkCacheService } from '../valuation/benchmark-cache.service';
import { Opportunity } from '../valuation/entities/opportunity.entity';
import { ValuationResult, ValuationService } from '../valuation/valuation.service';

const MILEAGE_BAND = 20;

export interface Assessment {
  detail: ListingDetail;
  result: ValuationResult;
  fairValue: number;
  currency: Currency;
}

export interface RankedOpportunity {
  opportunity: Opportunity;
  listing?: Listing;
}

/** Read-mostly queries exposed to the Telegram bot (on-demand check, top deals). */
@Injectable()
export class QueryService {
  private readonly minScore: number;
  private readonly minSamples: number;

  constructor(
    @Inject(LISTING_SOURCE) private readonly source: ListingSource,
    private readonly valuation: ValuationService,
    private readonly benchmarks: BenchmarkCacheService,
    private readonly listings: ListingsService,
    @InjectRepository(Opportunity) private readonly opportunities: Repository<Opportunity>,
    config: ConfigService<AppConfig, true>,
  ) {
    this.minScore = config.get('defaultMinDealScore', { infer: true });
    this.minSamples = config.get('defaultConfidenceMinSamples', { infer: true });
  }

  /** Fetch + evaluate a single listing on demand (spends budget). */
  async assessById(externalId: string): Promise<Assessment> {
    const detail = await this.source.fetch(externalId);
    const cohort = cohortFromDetail(detail);
    const benchmark = await this.benchmarks.getOrLoad('auto-ria', cohort, () =>
      this.source.averagePrice(cohort),
    );
    const result = this.valuation.evaluate({
      asking: detail.price.amount,
      fairValue: benchmark.value.amount,
      sampleSize: benchmark.sampleSize,
      minScore: this.minScore,
      minSamples: this.minSamples,
      sellerType: detail.sellerType,
      hasVinReport: detail.hasVinReport,
      damaged: detail.risk.damaged,
      salvage: detail.risk.salvage,
      unclearCustoms: detail.risk.unclearCustoms,
      confiscated: detail.risk.confiscated,
      underCredit: detail.risk.underCredit,
      abroad: detail.risk.abroad,
    });
    return { detail, result, fairValue: benchmark.value.amount, currency: benchmark.value.currency };
  }

  /** The highest-scoring opportunities recorded so far. */
  async topOpportunities(limit = 5): Promise<RankedOpportunity[]> {
    const ops = await this.opportunities.find({ order: { score: 'DESC' }, take: limit });
    const listings = await this.listings.findByIds(ops.map((o) => o.listingId));
    const byId = new Map(listings.map((l) => [l.id, l]));
    return ops.map((opportunity) => ({ opportunity, listing: byId.get(opportunity.listingId) }));
  }
}

function cohortFromDetail(d: ListingDetail): CohortQuery {
  const cohort: CohortQuery = {
    markId: d.markId,
    modelId: d.modelId,
    cityId: d.cityId ?? undefined,
    yearFrom: d.year,
    yearTo: d.year,
  };
  if (d.mileage != null) {
    cohort.mileageFrom = Math.max(0, d.mileage - MILEAGE_BAND);
    cohort.mileageTo = d.mileage + MILEAGE_BAND;
  }
  return cohort;
}
