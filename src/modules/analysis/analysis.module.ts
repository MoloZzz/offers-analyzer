import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Listing } from '../listings/entities/listing.entity';
import { SchedulingModule } from '../scheduling/scheduling.module';

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
  ],
  exports: [AnalysisService],
})
export class AnalysisModule {}
