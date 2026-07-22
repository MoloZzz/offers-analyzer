import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppConfig } from '../../common/config/configuration';
import { Currency } from '../../common/types/money';
import { OutcomesService } from '../calibration/outcomes.service';
import { Listing } from '../listings/entities/listing.entity';
import { ListingsService } from '../listings/listings.service';
import { ListingDetail, ListingSource, LISTING_SOURCE } from '../sources/ports/listing-source.port';
import { BenchmarkCacheService } from '../valuation/benchmark-cache.service';
import { resolveBenchmark } from '../valuation/cohort';
import { Opportunity } from '../valuation/entities/opportunity.entity';
import { MileageAdjuster } from '../valuation/mileage';
import { ValuationResult, ValuationService } from '../valuation/valuation.service';

import { buildDigest, realizedPrecision, ReportDigest } from './report';

export interface Assessment {
  detail: ListingDetail;
  result: ValuationResult;
  fairValue: number;
  currency: Currency;
  sampleSize: number;
  benchmarkBase: number;
  mileageAware: boolean;
}

export interface RankedOpportunity {
  opportunity: Opportunity;
  listing?: Listing;
}

/** Recent evaluation record for history command. */
export interface RecentEvaluation {
  listing: Listing;
  score: number;
  discountPct: number;
  evaluatedAt: Date;
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
    private readonly mileage: MileageAdjuster,
    private readonly outcomes: OutcomesService,
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
    const fairValue = benchmark ? this.mileage.fairValue(benchmark, detail) : 0;
    const currency = benchmark?.value.currency ?? Currency.USD;

    const result = this.valuation.evaluate({
      asking: detail.price.amount,
      fairValue,
      sampleSize: benchmark?.sampleSize ?? 0,
      minScore: this.minScore,
      minSamples: this.minSamples,
      make: detail.make,
      model: detail.model,
      gearbox: detail.gearbox,
      fuel: detail.fuel,
      engine: detail.engine,
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
    const sampleSize = benchmark?.sampleSize ?? 0;
    const benchmarkBase = benchmark?.value.amount ?? 0;
    const mileageAware = benchmark?.mileageAware ?? false;
    return { detail, result, fairValue, currency, sampleSize, benchmarkBase, mileageAware };
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

  /** Recently evaluated listings (for /history command). */
  async recentEvaluations(limit = 10): Promise<RecentEvaluation[]> {
    const listings = await this.listings.getRecentlyEvaluated(limit);
    return listings.map((l) => ({
      listing: l,
      score: l.lastScore ?? 0,
      discountPct: l.lastDiscountPct ?? 0,
      evaluatedAt: l.lastEvaluatedAt ?? new Date(0),
    }));
  }

  /** Self-tuning report (R1): distribution of scores, near-misses, and a suggested threshold. */
  async report(targetCandidates = 10): Promise<ReportDigest> {
    const scores = await this.listings.scoresForReport();
    const opportunities = await this.opportunities.count();
    const nm = await this.listings.nearMisses(Math.max(0, this.minScore - 0.1), this.minScore, 5);
    const nearMisses = nm.map((l) => ({
      label: `${l.make} ${l.model}, ${l.year}`,
      score: l.lastScore ?? 0,
      url: l.url,
    }));
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const labeled = await this.outcomes.manualLabeledSince(since);
    const good = labeled.filter((o) => o.label === 'good').length;
    const bad = labeled.filter((o) => o.label === 'bad').length;
    const precision = realizedPrecision(good, bad);
    return buildDigest(scores, opportunities, nearMisses, this.minScore, targetCandidates, precision);
  }

  /** Look up a recorded opportunity by id (for the 👍/👎 outcome buttons). */
  findOpportunity(id: string): Promise<Opportunity | null> {
    return this.opportunities.findOne({ where: { id } });
  }

  /** Look up a listing by its source external id (for the /outcome command). */
  async findListingByExternalId(externalId: string): Promise<Listing | null> {
    const [listing] = await this.listings.findByExternalIds([externalId]);
    return listing ?? null;
  }

  /** Recently evaluated listings (for /history command). */
  async getRecentEvaluations(limit = 10): Promise<Listing[]> {
    return this.listings.getRecentlyEvaluated(limit);
  }
}
