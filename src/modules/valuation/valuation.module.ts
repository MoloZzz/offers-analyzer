import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BenchmarkCacheService } from './benchmark-cache.service';
import { FairValueBenchmark } from './entities/fair-value-benchmark.entity';
import { Opportunity } from './entities/opportunity.entity';
import { ValuationService } from './valuation.service';

@Module({
  imports: [TypeOrmModule.forFeature([FairValueBenchmark, Opportunity])],
  providers: [ValuationService, BenchmarkCacheService],
  exports: [ValuationService, BenchmarkCacheService, TypeOrmModule],
})
export class ValuationModule {}
