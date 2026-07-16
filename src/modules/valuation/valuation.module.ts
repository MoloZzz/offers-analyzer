import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BenchmarkCacheService } from './benchmark-cache.service';
import { AveragePriceSnapshot } from './entities/average-price-snapshot.entity';
import { FairValueBenchmark } from './entities/fair-value-benchmark.entity';
import { Opportunity } from './entities/opportunity.entity';
import { MileageAdjuster } from './mileage';
import { ValuationService } from './valuation.service';

@Module({
  imports: [TypeOrmModule.forFeature([FairValueBenchmark, Opportunity, AveragePriceSnapshot])],
  providers: [ValuationService, BenchmarkCacheService, MileageAdjuster],
  exports: [ValuationService, BenchmarkCacheService, MileageAdjuster, TypeOrmModule],
})
export class ValuationModule {}
