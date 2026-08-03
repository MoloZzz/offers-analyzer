import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CalibrationModule } from '../calibration/calibration.module';
import { Listing } from '../listings/entities/listing.entity';
import { ListingsModule } from '../listings/listings.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { SourcesModule } from '../sources/sources.module';

import { BenchmarkCacheService } from './benchmark-cache.service';
import { AveragePriceSnapshot } from './entities/average-price-snapshot.entity';
import { FairValueBenchmark } from './entities/fair-value-benchmark.entity';
import { Opportunity } from './entities/opportunity.entity';
import { ValuationEvidence } from './entities/valuation-evidence.entity';
import { ValuationPolicyVersion } from './entities/valuation-policy-version.entity';
import { HeuristicTablesService } from './factors/tables';
import { MileageAdjuster } from './mileage';
import { ValuationEvidenceService } from './valuation-evidence.service';
import { ValuationShadowService } from './valuation-shadow.service';
import { ValuationService } from './valuation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FairValueBenchmark,
      Opportunity,
      AveragePriceSnapshot,
      Listing,
      ValuationPolicyVersion,
      ValuationEvidence,
    ]),
    CalibrationModule,
    SourcesModule,
    SchedulingModule,
    ListingsModule,
  ],
  providers: [
    ValuationService,
    BenchmarkCacheService,
    MileageAdjuster,
    HeuristicTablesService,
    ValuationEvidenceService,
    ValuationShadowService,
  ],
  exports: [
    ValuationService,
    BenchmarkCacheService,
    MileageAdjuster,
    ValuationEvidenceService,
    ValuationShadowService,
    TypeOrmModule,
  ],
})
export class ValuationModule {}
