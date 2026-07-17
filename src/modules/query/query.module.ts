import { Module } from '@nestjs/common';

import { CalibrationModule } from '../calibration/calibration.module';
import { ListingsModule } from '../listings/listings.module';
import { SourcesModule } from '../sources/sources.module';
import { ValuationModule } from '../valuation/valuation.module';

import { QueryService } from './query.service';

/** On-demand queries for the Telegram bot. Read-mostly; reuses the source + valuation + listings. */
@Module({
  imports: [SourcesModule, ValuationModule, ListingsModule, CalibrationModule],
  providers: [QueryService],
  exports: [QueryService],
})
export class QueryModule {}
