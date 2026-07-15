import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RateBudgetExhaustedError } from '../../common/errors/domain-error';
import { ListingsService } from '../listings/listings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SearchProfile } from '../profiles/entities/search-profile.entity';
import { ProfilesService } from '../profiles/profiles.service';
import {
  CohortQuery,
  ListingDetail,
  ListingSource,
  LISTING_SOURCE,
  SourceSearchQuery,
} from '../sources/ports/listing-source.port';
import { BenchmarkCacheService } from '../valuation/benchmark-cache.service';
import { Opportunity } from '../valuation/entities/opportunity.entity';
import { ValuationService } from '../valuation/valuation.service';

/**
 * The MVP pipeline (US1): for each enabled niche — search → new ids → fetch → value → alert.
 * Runs on a cron (no queue in v1). Every source call is budgeted; when the budget is exhausted
 * the cycle stops cleanly and resumes next tick (FR-012).
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

    for (const externalId of ids) {
      if (await this.listings.isKnown(externalId)) continue; // dedup: only new listings

      const detail = await this.source.fetch(externalId);
      if (profile.dealerPolicy === 'exclude' && detail.sellerType === 'dealer') continue;

      const { listing } = await this.listings.recordSeen(detail);

      const cohort = toCohort(detail);
      const benchmark = await this.benchmarks.getOrLoad('auto-ria', cohort, () =>
        this.source.averagePrice(cohort),
      );

      const result = this.valuation.evaluate({
        asking: detail.price.amount,
        fairValue: benchmark.value.amount,
        sampleSize: benchmark.sampleSize,
        minScore: profile.minDealScore,
        minSamples: profile.confidenceMinSamples,
        sellerType: detail.sellerType,
        hasVinReport: detail.vinReportUrl != null,
      });
      if (!result.isOpportunity) continue;

      const opportunity = await this.opportunities.save(
        this.opportunities.create({
          listingId: listing.id,
          profileId: profile.id,
          fairValue: benchmark.value.amount,
          currency: profile.currency,
          askingValue: detail.price.amount,
          discountPct: result.discountPct,
          confidence: result.confidence,
          score: result.score,
          redFlags: result.redFlags,
          notified: false,
        }),
      );

      await this.notifications.notifyOpportunity(opportunity, listing);
      opportunity.notified = true;
      await this.opportunities.save(opportunity);
    }
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
  };
}

/** ± thousand km around the listing's mileage — compare within a fair mileage band. */
const MILEAGE_BAND = 20;

function toCohort(d: ListingDetail): CohortQuery {
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
