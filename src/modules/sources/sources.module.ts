import { Module } from '@nestjs/common';

import { SchedulingModule } from '../scheduling/scheduling.module';

import { AutoRiaSource } from './auto-ria/auto-ria.source';
import { LISTING_SOURCE } from './ports/listing-source.port';

/** Provides the active ListingSource. AUTO.RIA is the only adapter in v1. */
@Module({
  imports: [SchedulingModule],
  providers: [AutoRiaSource, { provide: LISTING_SOURCE, useExisting: AutoRiaSource }],
  exports: [LISTING_SOURCE],
})
export class SourcesModule {}
