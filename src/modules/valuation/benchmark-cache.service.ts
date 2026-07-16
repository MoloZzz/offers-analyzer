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
    const existing = await this.repo.findOne({ where: { sourceKey, cohortKey } });
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

    const entity = existing ?? this.repo.create({ sourceKey, cohortKey });
    entity.value = loaded.value.amount;
    entity.currency = loaded.value.currency;
    entity.sampleSize = loaded.sampleSize;
    entity.expiresAt = new Date(Date.now() + ttlMs);
    await this.repo.save(entity);
    return loaded;
  }

  static cohortKey(c: CohortQuery): string {
    return [
      c.markId,
      c.modelId,
      c.cityId ?? '',
      c.yearFrom ?? '',
      c.yearTo ?? '',
      c.mileageFrom ?? '',
      c.mileageTo ?? '',
    ].join(':');
  }
}
