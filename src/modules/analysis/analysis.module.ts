import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Listing } from '../listings/entities/listing.entity';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { HeuristicTablesService } from '../valuation/factors/tables';

import { AnalysisService } from './analysis.service';
import { AiAnalysis } from './entities/ai-analysis.entity';
import { ANALYSIS_PROVIDER } from './ports/analysis-provider.port';
import { AnthropicAnalysisProvider } from './providers/anthropic-analysis.provider';

/**
 * SPEC-017 T001 — advisory AI analysis, physically separate from `valuation` (ADR-0019 §1).
 *
 * The separation is the enforcement, not a naming convention: `valuation` never imports this module,
 * so an accidental scoring dependency would be a visible import in review rather than a subtle
 * data-flow bug. `test/unit/analysis-module-boundary.spec.ts` fails CI if that ever changes.
 *
 * It is reached only from the Telegram surface, on an explicit admin action (FR-001). The polling
 * pipeline does not import it and must not.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Listing, AiAnalysis]), SchedulingModule],
  providers: [
    AnalysisService,
    AnthropicAnalysisProvider,
    { provide: ANALYSIS_PROVIDER, useExisting: AnthropicAnalysisProvider },
    // Provided here rather than imported from `ValuationModule` on purpose. The contradiction
    // display (T033) needs to *read* the curated repair-risk table, but importing ValuationModule
    // would drag `SourcesModule` — and therefore `LISTING_SOURCE` — into this injector, making a
    // source request reachable from a feature that must never make one. Same reasoning as the
    // spec-016 callback module. The service only reads versioned config files from disk.
    HeuristicTablesService,
  ],
  exports: [AnalysisService],
})
export class AnalysisModule {}
