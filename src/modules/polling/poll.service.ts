import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RateBudgetExhaustedError } from '../../common/errors/domain-error';
import { Currency } from '../../common/types/money';
import { ExchangeRate, EXCHANGE_RATE } from '../fx/ports/exchange-rate.port';
import { Listing } from '../listings/entities/listing.entity';
import { ListingsService } from '../listings/listings.service';
import { NotificationsService } from '../notifications/notifications.service';
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

/** How many already-seen listings to re-check per cycle for price drops (budget permitting). */
const REOBSERVE_PER_CYCLE = 5;

/**
 * The MVP pipeline (US1): for each enabled niche — search → new ids → fetch → value → alert.
 * Also re-observes a few known listings each cycle to catch price drops (FR-009). Runs on a cron
 * (no queue in v1). Every source call is budgeted; when the budget is exhausted (or the source
 * returns HTTP 429) the cycle stops cleanly and resumes next tick (FR-012).
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
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async poll(): Promise<void> {
    const profiles = await this.profiles.getEnabled();
    for (const profile of profiles) {
      try {
        await this.pollProfile(profile);
      } catch (err) {
        if (err instanceof RateBudgetExhaustedError) {
          this.logger.warn('Request budget exhausted — pausing this cycle');
          return;
        }
        this.logger.error(`Poll failed for profile ${profile.id}`, err as Error);
      }
    }
  }

  private async pollProfile(profile: SearchProfile): Promise<void> {
    const { ids } = await this.source.search(toQuery(profile));
    const known = await this.listings.findByExternalIds(ids);
    const knownIds = new Set(known.map((l) => l.externalId));

    // 1) New listings first (priority).
    for (const externalId of ids) {
      if (knownIds.has(externalId)) continue;
      await this.guarded(externalId, () => this.processNew(profile, externalId));
    }

    // 2) Re-observe a few already-seen listings (oldest first) to catch price drops.
    const stale = [...known]
      .sort((a, b) => a.lastSeenAt.getTime() - b.lastSeenAt.getTime())
      .slice(0, REOBSERVE_PER_CYCLE);
    for (const listing of stale) {
      await this.guarded(listing.externalId, () => this.reobserve(profile, listing));
    }
  }

  /** A budget-exhausted error stops the whole cycle; any other per-listing error just skips it. */
  private async guarded(externalId: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      if (err instanceof RateBudgetExhaustedError) throw err;
      this.logger.warn(`Skipping listing ${externalId}: ${(err as Error).message}`);
    }
  }

  private async processNew(profile: SearchProfile, externalId: string): Promise<void> {
    const detail = await this.source.fetch(externalId);
    if (profile.dealerPolicy === 'exclude' && detail.sellerType === 'dealer') return;
    const { listing } = await this.listings.recordSeen(detail);
    await this.evaluateAndNotify(profile, detail, listing, 'opportunity', null);
  }

  private async reobserve(profile: SearchProfile, existing: Listing): Promise<void> {
    const previousAmount = existing.currentAmount;
    const detail = await this.source.fetch(existing.externalId);
    const { listing } = await this.listings.recordSeen(detail);
    // Only a price drop is interesting here; the observation is recorded either way.
    if (detail.price.amount >= previousAmount) return;
    await this.evaluateAndNotify(profile, detail, listing, 'price_drop', previousAmount);
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
      sellerType: detail.sellerType,
      hasVinReport: detail.hasVinReport,
      damaged: detail.risk.damaged,
      salvage: detail.risk.salvage,
      unclearCustoms: detail.risk.unclearCustoms,
      confiscated: detail.risk.confiscated,
      underCredit: detail.risk.underCredit,
      abroad: detail.risk.abroad,
      description: detail.description,
    });

    await this.listings.recordEvaluation(listing, result.score, result.discountPct);
    if (!result.isOpportunity) return;

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
