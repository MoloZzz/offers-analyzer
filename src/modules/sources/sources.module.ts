import { Module } from '@nestjs/common';

import { SchedulingModule } from '../scheduling/scheduling.module';

import { AutoRiaAiValuationProvider } from './auto-ria/auto-ria-ai-valuation.provider';
import { AutoRiaSource } from './auto-ria/auto-ria.source';
import { LISTING_SOURCE } from './ports/listing-source.port';
import { VALUATION_PROVIDER } from './ports/valuation-provider.port';

/** Provides the active listing source and the disabled-by-default shadow valuation adapter. */
@Module({
  imports: [SchedulingModule],
  providers: [
    AutoRiaSource,
    AutoRiaAiValuationProvider,
    { provide: LISTING_SOURCE, useExisting: AutoRiaSource },
    { provide: VALUATION_PROVIDER, useExisting: AutoRiaAiValuationProvider },
  ],
  exports: [LISTING_SOURCE, VALUATION_PROVIDER],
})
export class SourcesModule {}
