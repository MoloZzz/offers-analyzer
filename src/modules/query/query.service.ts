import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppConfig } from '../../common/config/configuration';
import { Currency } from '../../common/types/money';
import { Listing } from '../listings/entities/listing.entity';
import { ListingsService } from '../listings/listings.service';
import { ListingDetail, ListingSource, LISTING_SOURCE } from '../sources/ports/listing-source.port';
import { BenchmarkCacheService } from '../valuation/benchmark-cache.service';
import { resolveBenchmark } from '../valuation/cohort';
import { Opportunity } from '../valuation/entities/opportunity.entity';
import { ValuationResult, ValuationService } from '../valuation/valuation.service';

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

/** Read-mostly queries exposed to the Telegram bot (on-demand check, top deals, best candidates). */
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
    const benchmark = await resolveBenchmark(this.source, this.benchmarks, detail);
    const fairValue = benchmark?.value.amount ?? 0;
    const currency = benchmark?.value.currency ?? Currency.USD;

    const result = this.valuation.evaluate({
      asking: detail.price.amount,
      fairValue,
      sampleSize: benchmark?.sampleSize ?? 0,
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
    return { detail, result, fairValue, currency };
  }

  /** The highest-scoring opportunities recorded so far. */
  async topOpportunities(limit = 5): Promise<RankedOpportunity[]> {
    const ops = await this.opportunities.find({ order: { score: 'DESC' }, take: limit });
    const listings = await this.listings.findByIds(ops.map((o) => o.listingId));
    const byId = new Map(listings.map((l) => [l.id, l]));
    return ops.map((opportunity) => ({ opportunity, listing: byId.get(opportunity.listingId) }));
  }

  /** Best-scoring evaluated listings, even below the alert threshold — the "best available now". */
  topCandidates(limit = 5): Promise<Listing[]> {
    return this.listings.topByScore(limit);
  }
}
