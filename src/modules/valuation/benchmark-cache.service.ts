import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Money } from '../../common/types/money';
import { CohortQuery } from '../sources/ports/listing-source.port';

import { AveragePriceSnapshot } from './entities/average-price-snapshot.entity';
import { FairValueBenchmark } from './entities/fair-value-benchmark.entity';

export interface BenchmarkValue {
  value: Money;
  sampleSize: number;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // one day — average price is a daily-stable figure

/** Bump whenever the persisted benchmark value changes meaning (SPEC-011 median switch). */
const BENCHMARK_ESTIMATOR_VERSION = 'median-v2';

/** Caches cohort average prices so we don't spend request budget re-fetching the same cohort. */
@Injectable()
export class BenchmarkCacheService {
  constructor(
    @InjectRepository(FairValueBenchmark)
    private readonly repo: Repository<FairValueBenchmark>,
    @InjectRepository(AveragePriceSnapshot)
    private readonly snapshots: Repository<AveragePriceSnapshot>,
  ) {}

  async getOrLoad(
    sourceKey: string,
    cohort: CohortQuery,
    loader: () => Promise<BenchmarkValue>,
    ttlMs: number = DEFAULT_TTL_MS,
  ): Promise<BenchmarkValue> {
    const cohortKey = BenchmarkCacheService.cohortKey(cohort);
    // Keep the snapshot cohort identity stable for disappearance calibration, but make a changed
    // estimator miss the short-lived cache instead of serving an old IQM value for a day.
    const cacheKey = `${BENCHMARK_ESTIMATOR_VERSION}|${cohortKey}`;
    const existing = await this.repo.findOne({ where: { sourceKey, cohortKey: cacheKey } });
    if (existing && existing.expiresAt.getTime() > Date.now()) {
      return {
        value: { amount: existing.value, currency: existing.currency },
        sampleSize: existing.sampleSize,
      };
    }

    const loaded = await loader();

    // Append a time-series snapshot (only fresh fetches reach here; cache hits returned above).
    if (loaded.value.amount > 0 && loaded.sampleSize > 0) {
      await this.snapshots.save(
        this.snapshots.create({
          sourceKey,
          cohortKey,
          value: loaded.value.amount,
          currency: loaded.value.currency,
          sampleSize: loaded.sampleSize,
        }),
      );
    }

    const entity = existing ?? this.repo.create({ sourceKey, cohortKey: cacheKey });
    entity.value = loaded.value.amount;
    entity.currency = loaded.value.currency;
    entity.sampleSize = loaded.sampleSize;
    entity.expiresAt = new Date(Date.now() + ttlMs);
    await this.repo.save(entity);
    return loaded;
  }

  /**
   * Cache/snapshot identity for a cohort. The drivetrain band is **appended** rather than folded
   * into the fixed seven fields, so a cohort that carries no band produces byte-identical keys to
   * the ones already stored — `average_price_snapshots` and `listing_disappearances.cohortKey`
   * (SPEC-004 calibration) join on this string across history.
   */
  static cohortKey(c: CohortQuery): string {
    const base = [
      c.markId,
      c.modelId,
      c.cityId ?? '',
      c.yearFrom ?? '',
      c.yearTo ?? '',
      c.mileageFrom ?? '',
      c.mileageTo ?? '',
    ].join(':');
    const band = [
      c.gearboxId != null ? `gear=${c.gearboxId}` : null,
      c.fuelId != null ? `fuel=${c.fuelId}` : null,
    ].filter(Boolean);
    return band.length > 0 ? `${base}:${band.join(':')}` : base;
  }
}
