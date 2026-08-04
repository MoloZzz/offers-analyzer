/**
 * Spec 006 value objects (ADR-0018). Types only — no behaviour, no imports from the service, so any
 * module (valuation, persistence, notifications, `/why`) can name these shapes without a cycle.
 *
 * All three are **projections** of an evaluation, never inputs to one. The invariant that makes the
 * whole spec safe lives here as a rule rather than a type: nothing below may be multiplied into
 * `score`, `priceCore`, `total100`, `discountPct`, `isOpportunity` or `disqualified`
 * (ADR-0018 §1, FR-002). `test/unit/valuation-additivity.spec.ts` is what enforces it.
 */

/**
 * The evidence inputs assessment confidence is weighted over. Stable machine keys — they are
 * persisted inside the evaluation explanation and read back by `/why`, so renaming one is a data
 * migration, not a refactor. Every key is a field that is **already fetched or already stored**
 * (ADR-0018 §2): none of them may cause a new source request.
 */
export type ConfidenceInputKey =
  /** AUTO.RIA's independent VIN check (`risk.vinChecked`). */
  | 'vin_checked'
  /** A full VIN report is available for the car (`hasVinReport`). */
  | 'vin_report'
  /** How many comparables backed the resolved benchmark. */
  | 'cohort_sample'
  /** How like-for-like the resolved cohort was (mileage-banded → make+model fallback). */
  | 'cohort_tier'
  /** Presence of gearbox / engine / body / fuel / generation. */
  | 'drivetrain_fields'
  /** Description present, and specific rather than a one-liner. */
  | 'description'
  /** Claimed mileage consistent with the segment expectation for the car's age. */
  | 'mileage_plausible';

/** One weighted evidence input and what it actually contributed to this listing's percent. */
export interface ConfidenceInput {
  key: ConfidenceInputKey;
  /**
   * Whether the input is **fully** evidenced. Partially-covered inputs (three of five drivetrain
   * fields, a present-but-thin description) are `false` with `0 < contribution < weight`, so
   * "present" never overstates what is known.
   */
  present: boolean;
  /** The input's weight in the active table. Persisted so a historical percent is reproducible. */
  weight: number;
  /** `weight × coverage`, rounded. The percent is the normalized sum of these. */
  contribution: number;
}

/**
 * One operator-facing line per input — always exactly one, so a percent can never contain an
 * unexplained deduction (SC-002) and no reason can be traced to two inputs at once. Generated from
 * the same weight table that produced `contribution`, which is why a weight change cannot
 * desynchronize from its explanation.
 */
export interface ConfidenceReason {
  key: ConfidenceInputKey;
  /** `✓` when the input is fully evidenced, `⚠` for every partial or missing one. */
  sign: '✓' | '⚠';
  text: string;
}

/**
 * How well-evidenced an *evaluation* is, 0–100 with a floor. Deliberately **not** the price-core
 * `confidence` (which is cohort sample size and does multiply into the score): this one is a
 * separate output and is never multiplied into anything. The naming stays explicit everywhere —
 * code, persisted schema, `/why`, glossary — because conflating the two is the primary maintenance
 * risk ADR-0018 records.
 */
export interface AssessmentConfidence {
  /** 0–100, integer, floored. Never a fabricated mid-range value when inputs are absent. */
  percent: number;
  /** Every weighted input, present or not — the full basis of `percent`. */
  inputs: ConfidenceInput[];
  /** One reason per input, same order as `inputs`. */
  reasons: ConfidenceReason[];
  /** True when the raw weighted sum fell below the floor, so `/why` can say so rather than imply evidence. */
  floored: boolean;
}

/**
 * One expected-value cost line (spec 006 US6.2): `p(failure) × cost`, with the σ captured from day
 * one so a later Monte Carlo needs no migration. `C_rec` is the sum of these. Never rendered as a
 * parts/paint/labour breakdown — that is false precision for damage the system cannot observe
 * (FR-004, ADR-0018 §7). Populated in a later phase; declared here so the shape is fixed once.
 */
export interface CostEstimate {
  /** The fired red-flag or matched repair-risk pattern this line came from. */
  code: string;
  /** p(failure) in [0, 1]. */
  probability: number;
  /** Cost if it happens, in USD. */
  cost: number;
  /** Standard deviation of `cost`. Stored, unconsumed in v1. */
  sigma: number;
  reason: string;
}

/**
 * The money decomposition (spec 006 US6.4): `X = RIA_average × k × (1 + drift × 1.5)`,
 * `Z = X × 0.92 − B − C_fix − C_rec − C_hold`, `ROI = Z / (B + C_fix + C_rec)`. Persisted whole so a
 * historical `Z` is reproducible from the explanation alone (FR-009). Populated in a later phase.
 *
 * `Z` is presentational: the 0–100 score remains the alert gate until a separate operator-approved
 * decision says otherwise (FR-010).
 */
export interface MonetaryOutput {
  /** Projected sale value. */
  x: number;
  /** Buy-side estimate `asking × (1 − torg)`. */
  b: number;
  /** Negotiation discount from the behavioural ladder, in [0, 1]. */
  torg: number;
  /** Paperwork / inspection / transfer fees, a ParameterSet constant. */
  cFix: number;
  /** `Σ probability × cost` over `costs`. */
  cRec: number;
  /** Holding cost `B × r × DOM_expected / 365`. */
  cHold: number;
  /** The lines behind `cRec`. */
  costs: CostEstimate[];
  /** Expected profit. Suppressed (`null`) for a hard-disqualified listing rather than shown negative. */
  z: number | null;
  /** Suppressed (`null`) when the denominator is near zero rather than rendered as an extreme percentage. */
  roi: number | null;
  /** Survivorship correction applied, or `null` when none exists yet. */
  kApplied: number | null;
  /** Monthly price drift applied, or `null`. */
  driftApplied: number | null;
  /**
   * True whenever no validated `k` was applied. `Z` MUST be labelled as such and MUST NOT be
   * presented as a profit forecast in that state (FR-008).
   */
  survivorshipUncorrected: boolean;
}
