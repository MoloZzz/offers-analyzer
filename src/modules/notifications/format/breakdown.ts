import { Currency } from '../../../common/types/money';
import { ListingDetail } from '../../sources/ports/listing-source.port';
import { valuationReasonLabel } from '../../valuation/comparability';
import { ValuationEvidence } from '../../valuation/entities/valuation-evidence.entity';
import {
  EvaluationExplanation,
  EvaluationExplanationV3,
} from '../../valuation/evaluation-explanation';
import { FactorScore } from '../../valuation/factors/factor';
import { ValuationResult } from '../../valuation/valuation.service';
import {
  AssessmentConfidence,
  ConfidenceInput,
  MonetaryOutput,
} from '../../valuation/valuation.types';

import {
  availableLine,
  Breakdown,
  BreakdownLine,
  BreakdownSection,
  BreakdownSectionKey,
  proseLine,
  unavailableLine,
} from './breakdown.types';
import { confidenceInputLabel } from './confidence-labels';
import { FLAG_LABELS } from './flag-labels';

/**
 * The one breakdown builder (spec 016 US16.1, FR-001).
 *
 * It **computes nothing**. Every emitted parameter is a field of the record it was given; a field
 * the record does not carry becomes an `unavailable` line with a reason (FR-004, SC-005). That
 * discipline is what lets the same code render a V1 snapshot from 2026-07 and a V3 one from today
 * without either lying about the other.
 *
 * Deliberately **not** rendered here: the spec-018 `accidentSeverity` shadow verdict. It is shadow
 * data behind an admin-only report (`/accident_shadow`) until phase 3 is approved, and surfacing it
 * in an operator-facing breakdown would leak a decision that has not been made.
 */

/** What a live `/why` or `/check` knows, alongside the `ValuationResult` itself. */
export interface LiveBreakdownContext {
  fairValue: number;
  currency: Currency;
  sampleSize: number;
  benchmarkBase: number;
  mileageAware: boolean;
}

/**
 * The normalized fact set both adapters produce. Having exactly one of these is what makes "one
 * renderer" true rather than aspirational: the section pipeline below has no idea whether it is
 * rendering a stored snapshot or a live computation.
 */
interface BreakdownFacts {
  /** `0` marks a live computation — it has no persisted schema and never had one. */
  schemaVersion: number;
  evaluatedAt: string | null;
  parameterSetVersion: number | null;
  thresholdUsed: number | null;
  listing: {
    make: string;
    model: string;
    year: number;
    url: string;
    askingAmount: number;
    currency: Currency;
  };
  cohort: { key?: string; tier?: string; sampleSize: number; mileageAware: boolean };
  fairValueBase: number;
  fairValueAdjusted: number;
  mileageAdjustment: number;
  discountPct: number;
  raw: number;
  confidence: number;
  penalty: number;
  score: number;
  priceCore: number;
  total100: number;
  factors: FactorScore[];
  firedFlags: Array<{ code: string; source: 'auto-ria' | 'description' | 'derived' }>;
  reason: string;
  isOpportunity: boolean;
  disqualified: boolean;
  /** `undefined` = the record's schema predates the measure; `null` = carried but not measured. */
  assessmentConfidence: AssessmentConfidence | null | undefined;
  monetary: MonetaryOutput | null | undefined;
  /** The immutable stored evidence row, never a fresh provider call. */
  providerEvidence: ValuationEvidence | null;
}

/** Build the breakdown from a persisted B23 explanation — zero source calls by construction. */
export function buildBreakdown(
  explanation: EvaluationExplanation,
  providerEvidence?: ValuationEvidence | null,
): Breakdown {
  const v3 = carriesV3Fields(explanation) ? explanation : null;
  return assemble({
    schemaVersion: explanation.schemaVersion,
    evaluatedAt: explanation.evaluatedAt,
    parameterSetVersion: explanation.parameterSetVersion,
    thresholdUsed: explanation.thresholdUsed,
    listing: {
      make: explanation.listing.make,
      model: explanation.listing.model,
      year: explanation.listing.year,
      url: explanation.listing.url,
      askingAmount: explanation.listing.askingAmount,
      currency: explanation.listing.currency,
    },
    cohort: explanation.cohort,
    fairValueBase: explanation.fairValueBase,
    fairValueAdjusted: explanation.fairValueAdjusted,
    mileageAdjustment: explanation.mileageAdjustment,
    discountPct: explanation.discountPct,
    raw: explanation.raw,
    confidence: explanation.confidence,
    penalty: explanation.penalty,
    score: explanation.score,
    priceCore: explanation.priceCore,
    total100: explanation.total100,
    factors: explanation.factors,
    firedFlags: explanation.firedFlags,
    reason: explanation.reason,
    isOpportunity: explanation.isOpportunity,
    disqualified: explanation.disqualified,
    // `undefined` here is load-bearing: it is how a V1/V2 snapshot says "this measure did not exist
    // yet", which reads very differently from a V3 that carries `null`.
    assessmentConfidence: v3 ? (v3.assessmentConfidence ?? null) : undefined,
    monetary: v3 ? (v3.monetary ?? null) : undefined,
    providerEvidence: providerEvidence ?? null,
  });
}

/**
 * Build the breakdown from a live computation that has not been persisted. Same sections, same
 * labels; the parameters a live result genuinely lacks (ParameterSet version, stored provider
 * evidence) are stated as unavailable rather than omitted.
 */
export function buildLiveBreakdown(
  detail: ListingDetail,
  result: ValuationResult,
  ctx: LiveBreakdownContext,
): Breakdown {
  return assemble({
    schemaVersion: 0,
    evaluatedAt: null,
    parameterSetVersion: null,
    thresholdUsed: null,
    listing: {
      make: detail.make,
      model: detail.model,
      year: detail.year,
      url: detail.url,
      askingAmount: detail.price.amount,
      currency: detail.price.currency,
    },
    cohort: { sampleSize: ctx.sampleSize, mileageAware: ctx.mileageAware },
    fairValueBase: ctx.benchmarkBase,
    fairValueAdjusted: ctx.fairValue,
    mileageAdjustment: Math.round(ctx.fairValue - ctx.benchmarkBase),
    discountPct: result.discountPct,
    raw: result.raw,
    confidence: result.confidence,
    penalty: result.penalty,
    score: result.score,
    priceCore: result.priceCore,
    total100: result.total100,
    factors: result.factors,
    firedFlags: Object.entries(result.redFlags)
      .filter(([, on]) => on)
      .map(([code]) => ({ code, source: liveFlagSource(code) })),
    reason: result.reason,
    isOpportunity: result.isOpportunity,
    disqualified: result.disqualified,
    // A live result carries the field itself, so `null` means "not measured" — never "too old".
    assessmentConfidence: result.assessmentConfidence ?? null,
    monetary: null,
    providerEvidence: null,
  });
}

function assemble(facts: BreakdownFacts): Breakdown {
  return {
    sections: [
      section('identity', '🔍 Оцінка', identityLines(facts)),
      section('price', '💵 Ціна та ринок', priceLines(facts)),
      section('cohort', '📊 Когорта', cohortLines(facts)),
      section('mileage', '🛣 Пробіг', mileageLines(facts)),
      section('provider', '📈 Оцінка провайдера', providerLines(facts)),
      section('score', '🧮 Розклад балу', scoreLines(facts)),
      section('factors', '⚙️ Фактори', factorLines(facts)),
      section('flags', '⚠️ Ризики', flagLines(facts)),
      section('confidence', '🧭 Впевненість оцінки', confidenceLines(facts)),
      section('monetary', '💰 Грошовий підсумок', monetaryLines(facts)),
      section('verdict', '🏁 Вердикт', verdictLines(facts)),
    ],
    evaluatedAt: facts.evaluatedAt,
    parameterSetVersion: facts.parameterSetVersion,
    schemaVersion: facts.schemaVersion,
  };
}

function section(
  key: BreakdownSectionKey,
  title: string,
  lines: BreakdownLine[],
): BreakdownSection {
  return { key, title, lines };
}

function identityLines(facts: BreakdownFacts): BreakdownLine[] {
  const lines: BreakdownLine[] = [
    proseLine(
      `🔍 Чому такий бал — ${facts.listing.make} ${facts.listing.model}, ${facts.listing.year}`,
    ),
  ];
  // A live computation has no ParameterSet snapshot to name. Saying so is the point: the operator
  // must be able to tell a reproducible historical evaluation from a just-computed one (FR-008).
  if (facts.parameterSetVersion == null || facts.thresholdUsed == null || !facts.evaluatedAt) {
    lines.push(
      unavailableLine(
        'Параметри',
        'жива оцінка — версію набору параметрів і час знімка не збережено',
        'live',
      ),
    );
    return lines;
  }
  lines.push(
    availableLine(
      'Параметри',
      `ParameterSet v${facts.parameterSetVersion}, поріг ${facts.thresholdUsed}, ${new Date(facts.evaluatedAt).toLocaleString('uk-UA')}`,
    ),
  );
  return lines;
}

function priceLines(facts: BreakdownFacts): BreakdownLine[] {
  return [
    availableLine(
      'Ціна',
      `${facts.listing.askingAmount} vs Ринкова: ${facts.fairValueAdjusted} ${facts.listing.currency} → знижка ${facts.discountPct}%`,
    ),
  ];
}

function cohortLines(facts: BreakdownFacts): BreakdownLine[] {
  const lines: BreakdownLine[] = [
    availableLine(
      'Ринкова база',
      `${facts.fairValueBase} ${facts.listing.currency} (${facts.cohort.mileageAware ? 'когорта з урахуванням пробігу' : 'когорта без пробігу'}, вибірка ${facts.cohort.sampleSize})`,
    ),
  ];
  lines.push(
    facts.cohort.key
      ? availableLine(
          'Когорта',
          `${facts.cohort.key}${facts.cohort.tier ? `, рівень ${facts.cohort.tier}` : ''}`,
        )
      : unavailableLine('Когорта', 'ключ когорти у знімку відсутній', 'record'),
  );
  return lines;
}

function mileageLines(facts: BreakdownFacts): BreakdownLine[] {
  if (facts.cohort.mileageAware) {
    return [
      unavailableLine(
        'Поправка на пробіг',
        'не застосовувалася — когорта вже враховує пробіг',
        'cohort',
      ),
    ];
  }
  const adjustment = facts.mileageAdjustment;
  return [
    availableLine(
      'Поправка на пробіг',
      adjustment === 0
        ? `без поправки (0 ${facts.listing.currency})`
        : `${adjustment > 0 ? '+' : ''}${adjustment} ${facts.listing.currency}`,
    ),
  ];
}

function scoreLines(facts: BreakdownFacts): BreakdownLine[] {
  return [
    availableLine('📊 Загальний бал', `${facts.total100}/100`),
    availableLine(
      'Розклад балу',
      `знижка → raw ${facts.raw} × впевненість ${facts.confidence} × штраф ${facts.penalty} = ${facts.score}`,
    ),
    availableLine('Ціновий core', `${facts.priceCore}`),
  ];
}

function factorLines(facts: BreakdownFacts): BreakdownLine[] {
  // An empty array is not an empty section: factors are deliberately inactive until the ADR-0010
  // rollout, and a blank list would read as "nothing contributed" (US16.1 AS-2).
  if (facts.factors.length === 0) {
    return [
      unavailableLine(
        '⚙️ Фактори',
        'композитні фактори неактивні — бал складається лише з цінового ядра',
        'inactive',
      ),
    ];
  }
  return facts.factors.map((f) =>
    proseLine(`• ${f.factor}: ${f.subScore100}/100 — ${f.reasons.join(', ')}`),
  );
}

function flagLines(facts: BreakdownFacts): BreakdownLine[] {
  const fromData: string[] = [];
  const fromDesc: string[] = [];
  const derived: string[] = [];
  for (const flag of facts.firedFlags) {
    // An unlabelled code is rendered raw rather than dropped — a flag the operator cannot see is
    // worse than one they have to look up.
    const label = FLAG_LABELS[flag.code] ?? flag.code;
    if (flag.source === 'description') fromDesc.push(label);
    else if (flag.source === 'derived') derived.push(label);
    else fromData.push(label);
  }
  const risks = [
    ...(fromData.length ? [`дані AUTO.RIA: ${fromData.join(', ')}`] : []),
    ...(fromDesc.length ? [`опис: ${fromDesc.join(', ')}`] : []),
    ...(derived.length ? [`оцінка: ${derived.join(', ')}`] : []),
  ];
  return [availableLine('⚠️ Ризики', risks.length ? risks.join(' · ') : 'не виявлено')];
}

/**
 * Assessment confidence (spec 006 US6.1) — evidence coverage, never a score input. The copy says so
 * on the header line so the two `confidence` numbers in this breakdown cannot be read as the same
 * measure (ADR-0018 §1).
 */
function confidenceLines(facts: BreakdownFacts): BreakdownLine[] {
  if (facts.assessmentConfidence === undefined) {
    return [
      unavailableLine(
        '🧭 Впевненість оцінки',
        `не рахувалася — знімок зроблено до появи цієї метрики (схема v${facts.schemaVersion}).`,
        'schema',
      ),
    ];
  }
  const confidence = facts.assessmentConfidence;
  if (!confidence) {
    // The no-`confidenceWeights` case and the swallowed-error case (US6.1 AS-4) are
    // indistinguishable in the record. Naming one specifically would be a claim the data cannot back.
    return [
      unavailableLine(
        '🧭 Впевненість оцінки',
        'не вимірювалася для цього знімка — активний набір параметрів не мав ваг або розрахунок не вдався. На бал і поріг це не впливає.',
        'unmeasured',
      ),
    ];
  }
  return [
    availableLine(
      '🧭 Впевненість оцінки',
      `${confidence.percent}% — це охоплення доказів, а не частина балу: на бал, поріг і рішення про сповіщення вона не впливає.`,
    ),
    ...(confidence.floored
      ? [proseLine('Доказів практично немає — показано нижню межу шкали, а не розрахований відсоток.')]
      : []),
    ...confidenceReasonLines(confidence),
  ];
}

/** One line per input, always — a percent may never contain an unexplained deduction (SC-002). */
function confidenceReasonLines(confidence: AssessmentConfidence): BreakdownLine[] {
  if (confidence.reasons.length === 0) {
    return [proseLine('Перелік підстав у знімку відсутній.')];
  }
  // Pairing by key rather than index keeps a reason attached to *its* input even if a record was
  // written with a different ordering.
  const byKey = new Map<string, ConfidenceInput>(confidence.inputs.map((i) => [i.key, i]));
  return confidence.reasons.map((reason) => {
    const input = byKey.get(reason.key);
    const weightNote = input ? ` (внесок ${input.contribution} з ${input.weight})` : '';
    return proseLine(
      `${reason.sign} ${confidenceInputLabel(reason.key)}: ${reason.text}${weightNote}`,
    );
  });
}

/**
 * The `Z`/`ROI` decomposition (spec 006 US6.4). Blocked on SPEC-004's `k`, so today every record
 * lands in one of the unavailable branches — the section exists so that the day records start
 * carrying `monetary`, it renders with no change here (US16.4, SC-006).
 */
function monetaryLines(facts: BreakdownFacts): BreakdownLine[] {
  if (facts.monetary === undefined) {
    return [
      unavailableLine(
        '💰 Грошовий підсумок',
        `не рахувався — знімок зроблено до появи цієї метрики (схема v${facts.schemaVersion}).`,
        'schema',
      ),
    ];
  }
  const monetary = facts.monetary;
  if (!monetary) {
    return [
      unavailableLine(
        '💰 Грошовий підсумок',
        'ще не рахується — очікує корекцію на виживання (k).',
        'unshipped',
      ),
    ];
  }
  const currency = facts.listing.currency;
  const lines: BreakdownLine[] = [
    monetary.z == null
      ? unavailableLine('💰 Очікуваний прибуток (Z)', 'не показано для дискваліфікованого авто', 'suppressed')
      : availableLine('💰 Очікуваний прибуток (Z)', `${monetary.z} ${currency}`),
    monetary.roi == null
      ? unavailableLine('ROI', 'знаменник близький до нуля — відсоток не показуємо', 'suppressed')
      : availableLine('ROI', `${monetary.roi}%`),
    availableLine('Продаж (X)', `${monetary.x} ${currency}`),
    availableLine('Купівля (B)', `${monetary.b} ${currency} (торг ${monetary.torg})`),
    availableLine(
      'Витрати',
      `оформлення ${monetary.cFix} + ремонт ${monetary.cRec} + утримання ${monetary.cHold} ${currency}`,
    ),
    monetary.kApplied == null
      ? unavailableLine('Корекція k', 'ще не застосовується', 'unshipped')
      : availableLine('Корекція k', `${monetary.kApplied}`),
  ];
  for (const cost of monetary.costs) {
    lines.push(proseLine(`• ${cost.code}: ${cost.probability} × ${cost.cost} ${currency}`));
  }
  return lines;
}

function verdictLines(facts: BreakdownFacts): BreakdownLine[] {
  const verdict = facts.isOpportunity
    ? '✅ Вигідно'
    : facts.disqualified
      ? '⛔ Пастка (дискваліфіковано ризиком)'
      : 'ℹ️ Не дотягує до порогу / мало даних';
  return [
    availableLine('Вердикт', verdict),
    availableLine('Підстава', facts.reason),
    proseLine(`🔗 ${facts.listing.url}`),
  ];
}

/* -------------------------------------------------------------------------------------------- */
/* Provider evidence (SPEC-015). Stored rows only — this builder must never trigger a request.    */
/* -------------------------------------------------------------------------------------------- */

function providerLines(facts: BreakdownFacts): BreakdownLine[] {
  const evidence = facts.providerEvidence;
  if (!evidence) {
    return [
      unavailableLine(
        '📈 AUTO.RIA AI',
        'shadow-оцінку активного ринку для цього знімка не збирали.',
        'not-collected',
      ),
    ];
  }

  // AUTO.RIA's current response has no independently asserted as-of timestamp. This is the local
  // response-capture time used for freshness, not a claim about when the provider calculated it.
  const localCaptureTime = evidence.sourceCapturedAt
    ? new Date(evidence.sourceCapturedAt).toLocaleString('uk-UA')
    : 'час джерела не отримано';
  const queryMode = evidence.queryMode === 'omni_id' ? 'за ID оголошення' : 'за параметрами';
  const decision =
    evidence.comparability === 'eligible' ? 'придатна для порівняння' : evidence.comparability;

  const lines: BreakdownLine[] = [
    evidence.status === 'available' && evidence.estimateAmount != null && evidence.currency
      ? proseLine(
          `📈 AUTO.RIA AI — оцінка активного ринку: ${Math.round(evidence.estimateAmount)} ${evidence.currency}.`,
        )
      : proseLine(
          `📈 AUTO.RIA AI — shadow-оцінка недоступна: ${evidence.status}${evidence.failureCode ? ` (${evidence.failureCode})` : ''}.`,
        ),
    proseLine(
      `Джерело: ${queryMode}; локальний час знімка відповіді: ${localCaptureTime}; policy ${evidence.policyKey}; adapter ${evidence.adapterVersion}; рішення: ${decision}.`,
    ),
    proseLine('Це оцінка активного ринку від провайдера, не підтверджена ціна продажу.'),
  ];

  const range = providerRange(evidence);
  lines.push(
    range
      ? proseLine(`Діапазон провайдера: ${range}.`)
      : proseLine('Діапазон провайдера: не надано джерелом.'),
  );
  lines.push(proseLine(providerComparableSummary(evidence)));
  lines.push(...inputCompletenessLines(evidence));
  const delta = evidence.legacyReference?.providerDeltaPct;
  if (typeof delta === 'number' && Number.isFinite(delta)) {
    lines.push(proseLine(`Різниця з legacy-базою: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%.`));
  }
  if (evidence.comparabilityReasons.length > 0) {
    lines.push(
      proseLine(
        `Пояснення якості: ${evidence.comparabilityReasons.map(valuationReasonLabel).join('; ')}.`,
      ),
    );
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

function inputCompletenessLines(evidence: ValuationEvidence): BreakdownLine[] {
  const completeness = evidence.inputCompleteness;
  if (!completeness) return [proseLine('Повнота вхідних даних: знімок відсутній.')];
  const missing = completeness.missingFacts ?? [];
  const material = completeness.missingMaterialDimensions ?? [];
  const relaxed = completeness.relaxedFacts ?? [];
  if (missing.length === 0 && material.length === 0 && relaxed.length === 0) {
    return [proseLine('Повнота вхідних даних: обов’язкові та матеріальні параметри наявні.')];
  }
  const parts: string[] = [];
  if (missing.length) parts.push(`немає: ${missing.join(', ')}`);
  if (material.length) parts.push(`матеріальні виміри: ${material.join(', ')}`);
  if (relaxed.length) parts.push(`послаблення: ${relaxed.join(', ')}`);
  return [proseLine(`Повнота вхідних даних: ${parts.join('; ')}.`)];
}

function finiteCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
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

/* -------------------------------------------------------------------------------------------- */
/* Rendering                                                                                      */
/* -------------------------------------------------------------------------------------------- */

/** One line of text. A labelled line reads `Label: value`; a prose line is emitted bare. */
export function renderLine(line: BreakdownLine): string {
  return line.label ? `${line.label}: ${line.value}` : line.value;
}

/** Flat text, no section titles — the `/why` shape, kept byte-compatible with its predecessor. */
export function renderBreakdownFlat(breakdown: Breakdown): string[] {
  return breakdown.sections.flatMap((s) => s.lines.map(renderLine));
}

/** One rendered block per section, titled — the `Деталі` shape. */
export function renderBreakdownSections(breakdown: Breakdown): string[] {
  return breakdown.sections
    .filter((s) => s.lines.length > 0)
    .map((s) => [s.title, ...s.lines.map(renderLine)].join('\n'));
}

/** Look one parameter up by section and label. Used by the compact surfaces (`/check`). */
export function findLine(
  breakdown: Breakdown,
  key: BreakdownSectionKey,
  label: string,
): BreakdownLine | undefined {
  return breakdown.sections.find((s) => s.key === key)?.lines.find((l) => l.label === label);
}

function carriesV3Fields(
  explanation: EvaluationExplanation,
): explanation is EvaluationExplanationV3 {
  // `>=` for the same reason `isEvaluationExplanationV2` uses it: an equality check would silently
  // drop these fields the day a V4 ships.
  return explanation.schemaVersion >= 3;
}

/** Mirrors `flagSource` in `evaluation-explanation.ts` for results that were never persisted. */
function liveFlagSource(code: string): 'auto-ria' | 'description' | 'derived' {
  if (code.startsWith('desc_')) return 'description';
  if (code === 'suspicious_low_mileage' || code === 'unverified_bargain') return 'derived';
  return 'auto-ria';
}
