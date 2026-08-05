import { ListingDetail } from '../../sources/ports/listing-source.port';
import { ValuationEvidence } from '../../valuation/entities/valuation-evidence.entity';
import { EvaluationExplanation } from '../../valuation/evaluation-explanation';
import { ValuationResult } from '../../valuation/valuation.service';

import {
  buildBreakdown,
  buildLiveBreakdown,
  LiveBreakdownContext,
  renderBreakdownFlat,
} from './breakdown';

export type WhyContext = LiveBreakdownContext;

/**
 * `/why` (B22) over a live computation — a listing that has no persisted explanation yet.
 *
 * Both `/why` paths are now thin adapters over the one breakdown builder (spec 016 US16.1). The
 * flat rendering — parameter lines, no section titles — is what keeps this output compatible with
 * the hand-written formatter it replaced; the `Деталі` button renders the same breakdown with its
 * section titles shown.
 */
export function formatWhy(detail: ListingDetail, result: ValuationResult, ctx: WhyContext): string {
  return renderBreakdownFlat(buildLiveBreakdown(detail, result, ctx)).join('\n');
}

/** Render a persisted B23 explanation snapshot without re-fetching or re-scoring the listing. */
export function formatStoredWhy(
  explanation: EvaluationExplanation,
  providerEvidence?: ValuationEvidence | null,
): string {
  return renderBreakdownFlat(buildBreakdown(explanation, providerEvidence)).join('\n');
}
