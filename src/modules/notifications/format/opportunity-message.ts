import { Currency } from '../../../common/types/money';
import { Listing } from '../../listings/entities/listing.entity';
import { ListingDetail, SellerType } from '../../sources/ports/listing-source.port';
import { Opportunity } from '../../valuation/entities/opportunity.entity';
import { EvaluationExplanation, EvaluationExplanationV3 } from '../../valuation/evaluation-explanation';
import { ValuationResult } from '../../valuation/valuation.service';
import { AssessmentConfidence } from '../../valuation/valuation.types';

import { confidenceInputLabel } from './confidence-labels';

/** Human-readable Ukrainian labels for red-flag codes. */
export const FLAG_LABELS: Record<string, string> = {
  suspicious_discount: 'підозріло дешево',
  damaged: 'була в ДТП',
  salvage: 'на запчастини',
  confiscated: 'конфіскат',
  under_credit: 'під кредитом',
  unclear_customs: 'нерозмитнена',
  abroad: 'за кордоном',
  no_vin_report: 'немає VIN-звіту',
  desc_after_accident: 'опис: після ДТП',
  desc_not_running: 'опис: не на ходу / на запчастини',
  desc_needs_repair: 'опис: потребує ремонту',
  desc_mechanical_issue: 'опис: проблеми з двигуном/КПП',
  suspicious_low_mileage: 'підозріло малий пробіг для віку',
  unverified_bargain: 'завелика знижка без VIN-перевірки',
};

function risksLabel(redFlags: Record<string, boolean>): string {
  const fired = Object.entries(redFlags)
    .filter(([, on]) => on)
    .map(([code]) => FLAG_LABELS[code] ?? code);
  return fired.length > 0 ? fired.join(', ') : 'не виявлено';
}

function sellerLabel(sellerType: SellerType): string {
  return sellerType === 'dealer'
    ? 'дилер'
    : sellerType === 'private'
      ? 'приватний'
      : 'невідомо';
}

function mileageLabel(mileage?: number | null): string {
  return mileage != null ? `${mileage} тис. км` : 'пробіг н/д';
}

function regionLabel(listing: Listing): string {
  if (listing.stateId == null) return 'н/д';
  return listing.cityId != null ? `${listing.stateId}/${listing.cityId}` : `${listing.stateId}`;
}

function scoreEmoji(score: number): string {
  return score >= 0.6 ? '🚗' : '📌';
}

/** How many reasons fit an alert line before it stops being an alert. `/why` carries the rest. */
const TOP_CONFIDENCE_REASONS = 2;

/**
 * One alert line for assessment confidence — the percent plus its heaviest reasons — or `null` when
 * there is nothing to say.
 *
 * **Absent renders as nothing at all**: no line, no `0%`, no "невідомо". An absent measure means the
 * active ParameterSet carries no `confidenceWeights`, or the guard swallowed a computation error
 * (US6.1 AS-4) — neither is evidence about the car, and a placeholder there would be exactly the
 * fabricated value the spec forbids.
 *
 * It is **evidence coverage, not a score**: it gates nothing, is not a discount, and is not a
 * probability of profit. Hence the deliberately different wording from the `Впевненість:` line
 * above, which is the price-core sample-size multiplier and does move the score (ADR-0018 §1).
 */
function confidenceLine(confidence?: AssessmentConfidence | null): string | null {
  if (!confidence) return null;
  const top = confidence.reasons
    .map((reason, index) => ({ reason, shortfall: shortfallAt(confidence, index) }))
    // Biggest evidence gap first; the table's own order breaks ties (sort is stable), so a
    // fully-evidenced listing shows its two heaviest `✓` inputs instead of an arbitrary pair.
    .sort((a, b) => b.shortfall - a.shortfall)
    .slice(0, TOP_CONFIDENCE_REASONS)
    .map(({ reason }) => `${reason.sign} ${confidenceInputLabel(reason.key)}`);
  return `🔎 Доказова база: ${confidence.percent}%${top.length > 0 ? ` · ${top.join(' · ')}` : ''}`;
}

/** Weight a reason failed to earn. Paired by index, but only once the keys agree. */
function shortfallAt(confidence: AssessmentConfidence, index: number): number {
  const input = confidence.inputs[index];
  const reason = confidence.reasons[index];
  if (!input || !reason || input.key !== reason.key) return 0;
  return input.weight - input.contribution;
}

/** Confidence off a persisted explanation; V1/V2 snapshots predate the field and simply lack it. */
function storedConfidence(explanation?: EvaluationExplanation | null): AssessmentConfidence | null {
  if (!explanation || explanation.schemaVersion < 3) return null;
  return (explanation as EvaluationExplanationV3).assessmentConfidence ?? null;
}

/**
 * Opportunity alert includes the contract-required region and sample-size count, and ends
 * with the AUTO.RIA backlink (ToS + FR-007). US3.
 */
export function formatOpportunity(op: Opportunity, listing: Listing): string {
  return [
    `🚗 ${listing.make} ${listing.model}, ${listing.year}, ${mileageLabel(listing.mileage)} — ${regionLabel(listing)}`,
    `Ціна: ${fmt(op.askingValue)} ${op.currency}   |   Ринкова (сер.): ${fmt(op.fairValue)} ${op.currency}`,
    `Знижка: ${op.discountPct}%   |   Впевненість: ${op.confidence} (${op.sampleSize} оголошень)`,
    `Рейтинг: ${scoreEmoji(op.score)} ${signed(op.score)} (-1...+1)`,
    `Перевірки: ${risksLabel(op.redFlags)}`,
    // Read from the persisted explanation, not recomputed: the alert must say what was evaluated.
    confidenceLine(storedConfidence(op.explanation)),
    `Продавець: ${sellerLabel(listing.sellerType)}`,
    `🔗 ${listing.url}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

/** Price-drop alert: a previously-seen listing got cheaper and is now a good deal (FR-009). */
export function formatPriceDrop(op: Opportunity, listing: Listing, oldAmount: number): string {
  const dropPct = oldAmount > 0 ? Math.round(((oldAmount - op.askingValue) / oldAmount) * 100) : 0;
  return [
    `📉 Ціна знижена: ${listing.make} ${listing.model}, ${listing.year}`,
    `Було ${fmt(oldAmount)} → стало ${fmt(op.askingValue)} ${op.currency} (-${dropPct}%)`,
    `💰 Вигідність: ${signed(op.score)}  ·  від ринку -${op.discountPct}%`,
    `🔗 ${listing.url}`,
  ].join('\n');
}

/** On-demand `/check` reply: assessment of a single listing the user asked about. */
export function formatAssessment(
  detail: ListingDetail,
  result: ValuationResult,
  fairValue: number,
  currency: Currency,
): string {
  const verdict = result.isOpportunity ? '✅ Вигідна пропозиція' : `ℹ️ ${result.reason}`;
  return [
    `${scoreEmoji(result.score)} ${detail.make} ${detail.model}, ${detail.year}, ${mileageLabel(detail.mileage)}`,
    `📊 Загальний бал: ${result.total100}/100`,
    `💰 Вигідність: ${signed(result.score)} (-1...+1)`,
    `Ціна: ${fmt(detail.price.amount)} ${currency}  ·  Ринкова: ${fmt(fairValue)} ${currency}  ·  -${result.discountPct}%`,
    `Впевненість: ${result.confidence}`,
    `Продавець: ${sellerLabel(detail.sellerType)}`,
    `⚠️ Ризики: ${risksLabel(result.redFlags)}`,
    confidenceLine(result.assessmentConfidence),
    verdict,
    `🔗 ${detail.url}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function fmt(n: number): string {
  return n.toLocaleString('uk-UA');
}
