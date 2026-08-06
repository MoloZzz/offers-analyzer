/**
 * Assessment confidence (spec 006 US6.1, ADR-0018). How well-evidenced *this evaluation* is, 0–100
 * with a floor. Pure + deterministic → unit-testable, and zero API budget: every input it reads is
 * already fetched or already stored (ADR-0018 §2).
 *
 * **It is an output, never an input.** It MUST NOT be multiplied into, added to, or otherwise reach
 * `score`, `priceCore`, `total100`, `discountPct`, `isOpportunity`, `disqualified` or any factor
 * modifier (FR-002). Multiplying it would triple-count evidence the sample-size gate and the
 * `unverified_bargain` dampener already count. `test/unit/valuation-additivity.spec.ts` is the guard.
 *
 * Do not confuse it with the price-core `confidence` (`min(1, sampleSize / (minSamples × 2))`),
 * which *does* multiply into the score. Cohort sample size appears below as **one weighted input of
 * seven**; that reuse is deliberate and is the only overlap between the two concepts.
 *
 * **Additive, unlike the score.** The score is bounded-multiplicative because a single fatal signal
 * must be able to kill it. This is a *coverage* measure, so missing evidence should degrade it
 * linearly rather than collapse it toward zero — a car with no VIN check is less known, not
 * unknowable (plan.md, Technical Context).
 *
 * Description-derived positive cues and price-history behaviour are out of scope for v1: the former
 * overlaps unbuilt spec 003 US4 and is seller-authored and gameable, the latter couples to the
 * unresolved removed-vs-fell-out-of-paging distinction (ADR-0018 §2).
 */
import {
  AssessmentConfidence,
  ConfidenceInput,
  ConfidenceInputKey,
  ConfidenceReason,
} from './valuation.types';

/** The zero-cost fields the measure reads. Structural, so callers need no adapter. */
export interface AssessmentConfidenceInput {
  /** AUTO.RIA's independent VIN check (`risk.vinChecked`). */
  vinChecked?: boolean;
  hasVinReport?: boolean;
  /** Comparables behind the resolved benchmark. */
  sampleSize: number;
  /** The profile's usable-cohort threshold — the yardstick `sampleSize` is judged against. */
  minSamples: number;
  /** `ResolvedBenchmark.cohort.tier`; absent when no benchmark resolved. */
  cohortTier?: string;
  gearbox?: string;
  engine?: string;
  body?: string;
  fuel?: string;
  generation?: string;
  description?: string;
  /** Claimed mileage, thousand km. */
  mileageK?: number;
  year?: number;
  /** Segment mileage expectation, thousand km/year (`ScoringParams.mileageAnnualK`). */
  mileageAnnualK: number;
  /** Injected for determinism, exactly as `assessMileageRisk` does. */
  now?: Date;
}

/**
 * Per-key weight overrides from the active `ParameterSet` (FR-007). A key absent from the override
 * map keeps its default weight; the map's *presence* is what enables the output at all, so an
 * operator can retune the measure without a deploy.
 */
export type ConfidenceWeights = Record<string, number>;

/**
 * Floor. A listing with no evidence at all reports this with every input named as a `⚠` reason —
 * never a fabricated mid-range percentage (spec Edge Cases). It is a floor rather than a true zero
 * because "we know nothing extra about this car" is not the same claim as "the evaluation is
 * worthless": the price core still stands behind it.
 */
export const CONFIDENCE_FLOOR = 10;

/** How like-for-like each resolved cohort tier is. Keys mirror `cohortTier()` in `cohort.ts`. */
const TIER_COVERAGE: Record<string, number> = {
  make_model_year_mileage: 1,
  // Gearbox+fuel stand in for trim and an exact year for generation; neither is like-for-like on
  // mileage, so both stay below the banded tier and above the bare year range.
  make_model_year_exact_trim: 0.85,
  make_model_year_trim: 0.75,
  make_model_year: 0.6,
  make_model: 0.3,
  make_model_fallback: 0.2,
};

/** The drivetrain fields `/info` is expected to carry; absence is a real evidence gap, not a defect. */
const DRIVETRAIN_FIELDS: ReadonlyArray<[label: string, read: (i: AssessmentConfidenceInput) => string | undefined]> = [
  ['коробка передач', (i) => i.gearbox],
  ['двигун', (i) => i.engine],
  ['кузов', (i) => i.body],
  ['паливо', (i) => i.fuel],
  ['покоління', (i) => i.generation],
];

/** A description this long is treated as more than a phone number and a shrug. */
const SPECIFIC_DESCRIPTION_CHARS = 120;

/**
 * One weighted evidence input. `met`/`unmet` are attached to the same row as `defaultWeight`, which
 * is the whole point: the percent and its explanation are produced by one table walk, so a weight
 * change cannot desynchronize from the text that justifies it (plan.md, Confidence shape).
 */
interface ConfidenceInputSpec {
  key: ConfidenceInputKey;
  defaultWeight: number;
  /** 0..1 — how much of this input's evidence the listing carries. Unknown is always 0, never >0. */
  coverage: (input: AssessmentConfidenceInput) => number;
  /** Text when fully evidenced. */
  met: string;
  /** Text when partial or absent — must name the input that was short. */
  unmet: (input: AssessmentConfidenceInput, coverage: number) => string;
}

/**
 * The weight table. Sums to 100 by default, though nothing depends on that — the percent is
 * normalized by the actual total, so an operator override cannot push it past 100 or leave it
 * unable to reach it.
 *
 * The ordering of magnitudes is the claim being made: **VIN evidence and cohort depth dominate**,
 * because they are the two things that most often make an evaluation wrong (odometer fraud and a
 * fair value drawn from too few comparables — ADR-0014, and the thin-cohort failure recorded in
 * `research/why-no-opportunities`). The descriptive fields are worth less individually but are the
 * most commonly missing, so they are graded rather than binary; a listing should not lose the same
 * amount for missing one field as for missing five.
 */
const WEIGHT_TABLE: readonly ConfidenceInputSpec[] = [
  {
    key: 'vin_checked',
    defaultWeight: 20,
    coverage: (i) => (i.vinChecked === true ? 1 : 0),
    met: 'VIN перевірено джерелом незалежно',
    unmet: () => 'VIN не перевірявся незалежно — історію та пробіг нічим не підтверджено',
  },
  {
    key: 'vin_report',
    defaultWeight: 15,
    coverage: (i) => (i.hasVinReport === true ? 1 : 0),
    met: 'є повний VIN-звіт',
    unmet: () => 'VIN-звіту немає',
  },
  {
    key: 'cohort_sample',
    defaultWeight: 20,
    coverage: (i) =>
      i.minSamples > 0 ? clamp01(i.sampleSize / (i.minSamples * 2)) : 0,
    met: 'справедливу ціну підкріплено повною вибіркою порівнянних',
    unmet: (i) =>
      i.sampleSize > 0
        ? `замала вибірка порівнянних (${i.sampleSize} із ${i.minSamples * 2} для повного заліку)`
        : 'вибірку порівнянних не зібрано — за справедливою ціною немає жодного зразка',
  },
  {
    key: 'cohort_tier',
    defaultWeight: 10,
    coverage: (i) => (i.cohortTier ? (TIER_COVERAGE[i.cohortTier] ?? 0) : 0),
    met: 'порівнянні збіглися і за пробігом, а не лише за маркою/моделлю/роком',
    unmet: (i) =>
      i.cohortTier
        ? `порівнянні збіглися лише на рівні «${i.cohortTier}», без відповідності за пробігом`
        : 'рівень когорти не визначено',
  },
  {
    key: 'drivetrain_fields',
    defaultWeight: 15,
    coverage: (i) => DRIVETRAIN_FIELDS.filter(([, read]) => hasText(read(i))).length / DRIVETRAIN_FIELDS.length,
    met: 'коробка передач, двигун, кузов, паливо і покоління — усі вказані',
    unmet: (i) => `бракує технічних полів: ${missingDrivetrainFields(i).join(', ')}`,
  },
  {
    key: 'description',
    defaultWeight: 10,
    coverage: (i) => descriptionCoverage(i.description),
    met: 'конкретний опис від продавця з деталями',
    unmet: (i) =>
      hasText(i.description)
        ? 'опис продавця короткий або без жодної конкретики'
        : 'опису від продавця немає',
  },
  {
    key: 'mileage_plausible',
    defaultWeight: 10,
    coverage: (i) => mileageCoverage(i),
    met: 'заявлений пробіг узгоджується з очікуванням для сегмента',
    unmet: (i) =>
      i.mileageK != null && i.mileageK > 0 && i.year != null && i.year > 0
        ? 'заявлений пробіг далеко від очікуваного для віку авто'
        : 'бракує пробігу або року — правдоподібність перевірити нічим',
  },
];

/**
 * Computes the percent and its reason list in a single walk of the weight table. Total ordering of
 * `inputs` and `reasons` is the table's, so `/why` renders a stable list.
 */
export function computeAssessmentConfidence(
  input: AssessmentConfidenceInput,
  weights: ConfidenceWeights,
): AssessmentConfidence {
  const inputs: ConfidenceInput[] = [];
  const reasons: ConfidenceReason[] = [];
  let totalWeight = 0;
  let earned = 0;

  for (const spec of WEIGHT_TABLE) {
    const weight = resolveWeight(weights, spec);
    const coverage = clamp01(spec.coverage(input));
    const contribution = round2(weight * coverage);
    const present = coverage >= 1;

    totalWeight += weight;
    earned += contribution;

    inputs.push({ key: spec.key, present, weight, contribution });
    reasons.push({
      key: spec.key,
      sign: present ? '✓' : '⚠',
      text: present ? spec.met : spec.unmet(input, coverage),
    });
  }

  // A table zeroed out by an operator override has no basis to report a percent from; the floor is
  // the honest answer, not a division by zero.
  const raw = totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : 0;
  return {
    percent: Math.max(CONFIDENCE_FLOOR, raw),
    inputs,
    reasons,
    floored: raw < CONFIDENCE_FLOOR,
  };
}

/** An override of `0` is a legitimate "switch this input off", so `??` — not `||`. */
function resolveWeight(weights: ConfidenceWeights, spec: ConfidenceInputSpec): number {
  const override = weights[spec.key];
  return typeof override === 'number' && Number.isFinite(override) && override >= 0
    ? override
    : spec.defaultWeight;
}

function missingDrivetrainFields(input: AssessmentConfidenceInput): string[] {
  return DRIVETRAIN_FIELDS.filter(([, read]) => !hasText(read(input))).map(([label]) => label);
}

/**
 * Presence is half the credit; the rest is specificity, approximated deterministically by length and
 * the presence of a concrete number (spec Assumptions). Deliberately crude — a lexicon of positive
 * cues is spec 003 US4 and is explicitly out of scope here.
 */
function descriptionCoverage(description?: string): number {
  const text = (description ?? '').trim();
  if (text.length === 0) return 0;
  let coverage = 0.5;
  if (text.length >= SPECIFIC_DESCRIPTION_CHARS) coverage += 0.25;
  if (/\d/.test(text)) coverage += 0.25;
  return coverage;
}

/**
 * Mileage plausibility against the segment expectation (`mileageAnnualK` per year of age). Graded
 * rather than binary because a 30%-off-expected car is ordinary and a 5x-off one is not, and the
 * measure should say which. An unknown mileage or year scores 0 — unknown inputs lower confidence
 * and never raise it (US6.1).
 */
function mileageCoverage(input: AssessmentConfidenceInput): number {
  if (input.mileageK == null || input.mileageK <= 0) return 0;
  if (input.year == null || input.year <= 0) return 0;
  if (input.mileageAnnualK <= 0) return 0;

  const now = input.now ?? new Date();
  const age = Math.max(1, now.getFullYear() - input.year);
  const ratio = input.mileageK / (age * input.mileageAnnualK);
  if (ratio >= 0.5 && ratio <= 1.5) return 1;
  if (ratio >= 0.25 && ratio <= 2.5) return 0.5;
  return 0;
}

function hasText(value?: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
