import { Currency } from '../../../common/types/money';
import { ListingDetail } from '../../sources/ports/listing-source.port';
import { valuationReasonLabel } from '../../valuation/comparability';
import { ValuationEvidence } from '../../valuation/entities/valuation-evidence.entity';
import {
  EvaluationExplanation,
  EvaluationExplanationV3,
} from '../../valuation/evaluation-explanation';
import { ValuationResult } from '../../valuation/valuation.service';
import { AssessmentConfidence, ConfidenceInput } from '../../valuation/valuation.types';

import { confidenceInputLabel } from './confidence-labels';
import { FLAG_LABELS } from './opportunity-message';

export interface WhyContext {
  fairValue: number;
  currency: Currency;
  sampleSize: number;
  benchmarkBase: number;
  mileageAware: boolean;
}

/** Ukrainian breakdown of how the deal score was derived — the /why command (B22). */
export function formatWhy(detail: ListingDetail, result: ValuationResult, ctx: WhyContext): string {
  const firedFromData: string[] = [];
  const firedFromDesc: string[] = [];
  for (const [code, on] of Object.entries(result.redFlags)) {
    if (!on) continue;
    const label = FLAG_LABELS[code] ?? code;
    (code.startsWith('desc_') ? firedFromDesc : firedFromData).push(label);
  }
  const mileageAdj = Math.round(ctx.fairValue - ctx.benchmarkBase);
  const verdict = result.isOpportunity
    ? '✅ Вигідно'
    : result.disqualified
      ? '⛔ Пастка (дискваліфіковано ризиком)'
      : 'ℹ️ Не дотягує до порогу / мало даних';
  const lines = [
    `🔍 Чому такий бал — ${detail.make} ${detail.model}, ${detail.year}`,
    `📊 Загальний бал: ${result.total100}/100`,
    `Ціна: ${detail.price.amount} vs Ринкова: ${ctx.fairValue} ${ctx.currency} → знижка ${result.discountPct}%`,
    `Ринкова база: ${ctx.benchmarkBase} ${ctx.currency} (${ctx.mileageAware ? 'когорта з урахуванням пробігу' : 'когорта без пробігу'}, вибірка ${ctx.sampleSize})`,
  ];
  if (!ctx.mileageAware && mileageAdj !== 0) {
    lines.push(`Поправка на пробіг: ${mileageAdj > 0 ? '+' : ''}${mileageAdj} ${ctx.currency}`);
  }
  lines.push(
    `Розклад балу: знижка → raw ${result.raw} × впевненість ${result.confidence} × штраф ${result.penalty} = ${result.score}`,
  );
  // Per-factor composite breakdown (spec 003). Empty until factors ship (Phase F).
  for (const f of result.factors) {
    lines.push(`• ${f.factor}: ${f.subScore100}/100 — ${f.reasons.join(', ')}`);
  }
  const risks = [
    ...(firedFromData.length ? [`дані AUTO.RIA: ${firedFromData.join(', ')}`] : []),
    ...(firedFromDesc.length ? [`опис: ${firedFromDesc.join(', ')}`] : []),
  ];
  lines.push(`⚠️ Ризики: ${risks.length ? risks.join(' · ') : 'не виявлено'}`);
  lines.push(`Вердикт: ${verdict}`);
  lines.push(`🔗 ${detail.url}`);
  return lines.join('\n');
}

/** Render a persisted B23 explanation snapshot without re-fetching or re-scoring the listing. */
export function formatStoredWhy(
  explanation: EvaluationExplanation,
  providerEvidence?: ValuationEvidence | null,
): string {
  const firedFromData: string[] = [];
  const firedFromDesc: string[] = [];
  const firedDerived: string[] = [];
  for (const flag of explanation.firedFlags) {
    const label = FLAG_LABELS[flag.code] ?? flag.code;
    if (flag.source === 'description') firedFromDesc.push(label);
    else if (flag.source === 'derived') firedDerived.push(label);
    else firedFromData.push(label);
  }

  const verdict = explanation.isOpportunity
    ? '✅ Вигідно'
    : explanation.disqualified
      ? '⛔ Пастка (дискваліфіковано ризиком)'
      : 'ℹ️ Не дотягує до порогу / мало даних';

  const lines = [
    `🔍 Чому такий бал — ${explanation.listing.make} ${explanation.listing.model}, ${explanation.listing.year}`,
    `📊 Загальний бал: ${explanation.total100}/100`,
    `Ціна: ${explanation.listing.askingAmount} vs Ринкова: ${explanation.fairValueAdjusted} ${explanation.listing.currency} → знижка ${explanation.discountPct}%`,
    `Ринкова база: ${explanation.fairValueBase} ${explanation.listing.currency} (${explanation.cohort.mileageAware ? 'когорта з урахуванням пробігу' : 'когорта без пробігу'}, вибірка ${explanation.cohort.sampleSize})`,
    `Параметри: ParameterSet v${explanation.parameterSetVersion}, поріг ${explanation.thresholdUsed}, ${new Date(explanation.evaluatedAt).toLocaleString('uk-UA')}`,
  ];
  if (!explanation.cohort.mileageAware && explanation.mileageAdjustment !== 0) {
    lines.push(
      `Поправка на пробіг: ${explanation.mileageAdjustment > 0 ? '+' : ''}${explanation.mileageAdjustment} ${explanation.listing.currency}`,
    );
  }
  lines.push(...formatProviderEvidence(providerEvidence));
  lines.push(
    `Розклад балу: знижка → raw ${explanation.raw} × впевненість ${explanation.confidence} × штраф ${explanation.penalty} = ${explanation.score}`,
  );
  for (const f of explanation.factors) {
    lines.push(`• ${f.factor}: ${f.subScore100}/100 — ${f.reasons.join(', ')}`);
  }
  lines.push(...formatAssessmentConfidence(explanation));
  const risks = [
    ...(firedFromData.length ? [`дані AUTO.RIA: ${firedFromData.join(', ')}`] : []),
    ...(firedFromDesc.length ? [`опис: ${firedFromDesc.join(', ')}`] : []),
    ...(firedDerived.length ? [`оцінка: ${firedDerived.join(', ')}`] : []),
  ];
  lines.push(`⚠️ Ризики: ${risks.length ? risks.join(' · ') : 'не виявлено'}`);
  lines.push(`Вердикт: ${verdict}`);
  lines.push(`🔗 ${explanation.listing.url}`);
  return lines.join('\n');
}

/**
 * The **full** assessment-confidence reason list (spec 006 US6.1, SC-005) — this is what separates
 * `/why` from the one-line alert, which shows only the percent and the top reasons.
 *
 * Rendered from the persisted explanation and nothing else: no re-fetch, no recomputation, no call
 * into the valuation service. A record that carries no confidence says so plainly rather than
 * growing one at render time.
 *
 * The percent is **evidence coverage**, not a score input. It is never multiplied into `score`,
 * `total100`, the threshold, or the alert decision (ADR-0018 §1), and the copy says so on the
 * header line so an operator cannot read the two as the same number.
 */
function formatAssessmentConfidence(explanation: EvaluationExplanation): string[] {
  // Three genuinely different absences, and the record itself is what distinguishes them. V1/V2
  // predate the measure entirely — that is an old snapshot, not a fault, and must not read as one.
  if (!carriesAssessmentConfidence(explanation)) {
    return [
      `🧭 Впевненість оцінки: не рахувалася — знімок зроблено до появи цієї метрики (схема v${explanation.schemaVersion}).`,
    ];
  }

  const confidence = explanation.assessmentConfidence;
  if (!confidence) {
    // A V3 record with no confidence: either the active ParameterSet carried no `confidenceWeights`,
    // or the guard swallowed a computation error (US6.1 AS-4). The persisted record cannot tell the
    // two apart — inventing a specific cause here would be a claim the data does not support.
    return [
      '🧭 Впевненість оцінки: не вимірювалася для цього знімка — активний набір параметрів не мав ваг або розрахунок не вдався. На бал і поріг це не впливає.',
    ];
  }

  return [
    `🧭 Впевненість оцінки: ${confidence.percent}% — це охоплення доказів, а не частина балу: на бал, поріг і рішення про сповіщення вона не впливає.`,
    ...(confidence.floored
      ? ['Доказів практично немає — показано нижню межу шкали, а не розрахований відсоток.']
      : []),
    ...formatConfidenceReasons(confidence),
  ];
}

/**
 * Whether the record's schema is new enough to carry the field at all. `>=` for the same reason
 * `isEvaluationExplanationV2` uses it: an equality check would silently drop confidence from `/why`
 * the day a V4 ships.
 */
function carriesAssessmentConfidence(
  explanation: EvaluationExplanation,
): explanation is EvaluationExplanationV3 {
  return explanation.schemaVersion >= 3;
}

/** One line per input, always — a percent may never contain an unexplained deduction (SC-002). */
function formatConfidenceReasons(confidence: AssessmentConfidence): string[] {
  if (confidence.reasons.length === 0) {
    return ['Перелік підстав у знімку відсутній.'];
  }
  // Reasons and inputs are one-to-one and same-ordered by construction, but pairing by key keeps a
  // reason attached to *its* input even if a record was written with a different ordering.
  const byKey = new Map<string, ConfidenceInput>(confidence.inputs.map((i) => [i.key, i]));
  return confidence.reasons.map((reason) => {
    const label = confidenceInputLabel(reason.key);
    const input = byKey.get(reason.key);
    const weightNote = input ? ` (внесок ${input.contribution} з ${input.weight})` : '';
    return `${reason.sign} ${label}: ${reason.text}${weightNote}`;
  });
}

/** Stored provider evidence only: this formatter must never trigger a source request. */
function formatProviderEvidence(evidence?: ValuationEvidence | null): string[] {
  if (!evidence) {
    return [
      '📈 AUTO.RIA AI: shadow-оцінку активного ринку для цього знімка не збирали.',
    ];
  }

  // AUTO.RIA's current response has no independently asserted as-of timestamp. This is the local
  // response-capture time used for freshness, not a claim about when the provider calculated it.
  const localCaptureTime = evidence.sourceCapturedAt
    ? new Date(evidence.sourceCapturedAt).toLocaleString('uk-UA')
    : 'час джерела не отримано';
  const queryMode = evidence.queryMode === 'omni_id' ? 'за ID оголошення' : 'за параметрами';
  const decision = evidence.comparability === 'eligible' ? 'придатна для порівняння' : evidence.comparability;
  const lines = [
    evidence.status === 'available' && evidence.estimateAmount != null && evidence.currency
      ? `📈 AUTO.RIA AI — оцінка активного ринку: ${Math.round(evidence.estimateAmount)} ${evidence.currency}.`
      : `📈 AUTO.RIA AI — shadow-оцінка недоступна: ${evidence.status}${evidence.failureCode ? ` (${evidence.failureCode})` : ''}.`,
    `Джерело: ${queryMode}; локальний час знімка відповіді: ${localCaptureTime}; policy ${evidence.policyKey}; adapter ${evidence.adapterVersion}; рішення: ${decision}.`,
    'Це оцінка активного ринку від провайдера, не підтверджена ціна продажу.',
  ];

  const range = providerRange(evidence);
  if (range) lines.push(`Діапазон провайдера: ${range}.`);
  else lines.push('Діапазон провайдера: не надано джерелом.');
  lines.push(providerComparableSummary(evidence));
  lines.push(...formatInputCompleteness(evidence));
  const delta = evidence.legacyReference?.providerDeltaPct;
  if (typeof delta === 'number' && Number.isFinite(delta)) {
    lines.push(`Різниця з legacy-базою: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%.`);
  }
  if (evidence.comparabilityReasons.length > 0) {
    lines.push(`Пояснення якості: ${evidence.comparabilityReasons.map(valuationReasonLabel).join('; ')}.`);
  }
  return lines;
}

function providerRange(evidence: ValuationEvidence): string | null {
  const stats = evidence.providerStatistics;
  if (!stats || typeof stats !== 'object') return null;
  const minimum = moneyFromProjection(stats.minimum);
  const maximum = moneyFromProjection(stats.maximum);
  if (!minimum || !maximum) return null;
  return `від ${Math.round(minimum.amount)} ${minimum.currency} до ${Math.round(maximum.amount)} ${maximum.currency}`;
}

function providerComparableSummary(evidence: ValuationEvidence): string {
  const summary = evidence.comparableSummary;
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return 'Порівняльні оголошення: джерело не надало підсумок.';
  }
  const values = summary as Record<string, unknown>;
  const returned = finiteCount(values.returnedCount);
  const retained = finiteCount(values.retainedCount);
  if (returned == null || retained == null) {
    return 'Порівняльні оголошення: кількість не надана джерелом.';
  }
  return `Порівняльні оголошення: отримано ${returned}, збережено ${retained}.`;
}

function formatInputCompleteness(evidence: ValuationEvidence): string[] {
  const completeness = evidence.inputCompleteness;
  if (!completeness) return ['Повнота вхідних даних: знімок відсутній.'];
  const missing = completeness.missingFacts ?? [];
  const material = completeness.missingMaterialDimensions ?? [];
  const relaxed = completeness.relaxedFacts ?? [];
  if (missing.length === 0 && material.length === 0 && relaxed.length === 0) {
    return ['Повнота вхідних даних: обов’язкові та матеріальні параметри наявні.'];
  }
  const parts: string[] = [];
  if (missing.length) parts.push(`немає: ${missing.join(', ')}`);
  if (material.length) parts.push(`матеріальні виміри: ${material.join(', ')}`);
  if (relaxed.length) parts.push(`послаблення: ${relaxed.join(', ')}`);
  return [`Повнота вхідних даних: ${parts.join('; ')}.`];
}

function finiteCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function moneyFromProjection(value: unknown): { amount: number; currency: string } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.amount === 'number' &&
    Number.isFinite(candidate.amount) &&
    typeof candidate.currency === 'string' &&
    candidate.currency.trim() !== ''
    ? { amount: candidate.amount, currency: candidate.currency }
    : null;
}
