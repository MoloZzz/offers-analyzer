import { Currency } from '../../common/types/money';
import { ListingDetail } from '../sources/ports/listing-source.port';

import { AccidentSeverity } from './accident-severity';
import { ResolvedBenchmark } from './cohort';
import { FactorScore } from './factors/factor';
import {
  ValuationComparability,
  ValuationEvidenceStatus,
  ValuationEvidenceTarget,
  ValuationQueryMode,
} from './valuation-evidence.types';
import { ValuationResult } from './valuation.service';
import { AssessmentConfidence, MonetaryOutput } from './valuation.types';

export interface EvaluationExplanationBase {
  evaluatedAt: string;
  parameterSetVersion: number;
  thresholdUsed: number;
  listing: {
    externalId: string;
    make: string;
    model: string;
    year: number;
    url: string;
    askingAmount: number;
    currency: Currency;
  };
  cohort: {
    key?: string;
    tier?: string;
    sampleSize: number;
    mileageAware: boolean;
  };
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
  redFlags: Record<string, boolean>;
  reason: string;
  isOpportunity: boolean;
  disqualified: boolean;
}

/** Legacy persisted scoring snapshot. It remains byte-for-byte compatible with old /why records. */
export interface EvaluationExplanationV1 extends EvaluationExplanationBase {
  schemaVersion: 1;
}

/** A compact reference only; full provider evidence stays immutable in valuation_evidence. */
export interface ProviderEvidenceReference {
  evidenceId: string;
  target: ValuationEvidenceTarget;
  providerKey: string;
  policyKey: string;
  adapterVersion: string;
  status: ValuationEvidenceStatus;
  comparability: ValuationComparability;
  sourceCapturedAt?: string | null;
  queryMode: ValuationQueryMode;
  estimateAvailable: boolean;
  rangeAvailable: boolean;
  legacyDeltaPct?: number | null;
  reasonCodes: string[];
}

/** Additive explanation projection; it cannot replace or alter legacy score values. */
export interface EvaluationExplanationV2 extends EvaluationExplanationBase {
  schemaVersion: 2;
  providerEvidence?: ProviderEvidenceReference | null;
}

/**
 * Adds the spec-018 shadow accident verdict, the heuristic-table provenance, and the spec-006
 * projections. All are additive and none participates in the scoring values above — a V3 record
 * scores identically to the V1 it would otherwise have been.
 *
 * V3 is deliberately **one** version that grows by adding optional fields rather than a version per
 * spec: every field here is independently optional, so a record written before a given field shipped
 * is still a valid V3 and `/why` renders what a record actually carries. Bumping to V4 for an
 * additive field would only buy a number that no reader can act on.
 */
export interface EvaluationExplanationV3 extends EvaluationExplanationBase {
  schemaVersion: 3;
  providerEvidence?: ProviderEvidenceReference | null;
  /**
   * Graded accident verdict recorded in shadow while the hard clamp stays live (spec 018 US18.2).
   * Absent/`null` means no accident signal — not "no accident risk assessed".
   */
  accidentSeverity?: AccidentSeverity | null;
  /**
   * Content hashes of the heuristic tables that scored this listing (spec 018 T002, carried over
   * from phase 1). Answers "which table version produced this verdict" without a ParameterSet
   * schema change; covers liquidity, repair-risk and accident-severity together.
   */
  heuristicTableHashes?: Record<string, string>;
  /**
   * How well-evidenced this evaluation was (spec 006 US6.1). `null` when the active ParameterSet
   * carries no `confidenceWeights`, or when the computation failed — absent means "not measured",
   * never "poorly evidenced". `/why` renders the full reason list from here with zero source calls
   * (SC-005), which is why the inputs and their weights are persisted and not just the percent.
   *
   * It is **not** the `confidence` field above. That one is cohort sample size and multiplies into
   * the score; this one is never multiplied into anything (ADR-0018 §1).
   */
  assessmentConfidence?: AssessmentConfidence | null;
  /**
   * The `Z`/`ROI` decomposition (spec 006 US6.4), persisted whole so a historical `Z` is
   * reproducible. Not populated yet — US6.4 is blocked on SPEC-004's `k`.
   */
  monetary?: MonetaryOutput | null;
}

export type EvaluationExplanation =
  | EvaluationExplanationV1
  | EvaluationExplanationV2
  | EvaluationExplanationV3;

export function buildEvaluationExplanation(input: {
  detail: ListingDetail;
  benchmark: ResolvedBenchmark | null;
  fairValue: number;
  result: ValuationResult;
  parameterSetVersion: number;
  thresholdUsed: number;
  evaluatedAt?: Date;
  heuristicTableHashes?: Record<string, string>;
}): EvaluationExplanationV3 {
  const fairValueBase = input.benchmark?.value.amount ?? 0;
  return {
    schemaVersion: 3,
    evaluatedAt: (input.evaluatedAt ?? new Date()).toISOString(),
    parameterSetVersion: input.parameterSetVersion,
    thresholdUsed: input.thresholdUsed,
    listing: {
      externalId: input.detail.externalId,
      make: input.detail.make,
      model: input.detail.model,
      year: input.detail.year,
      url: input.detail.url,
      askingAmount: input.detail.price.amount,
      currency: input.detail.price.currency,
    },
    cohort: {
      key: input.benchmark?.cohort.key,
      tier: input.benchmark?.cohort.tier,
      sampleSize: input.benchmark?.sampleSize ?? 0,
      mileageAware: input.benchmark?.mileageAware ?? false,
    },
    fairValueBase,
    fairValueAdjusted: input.fairValue,
    mileageAdjustment: Math.round(input.fairValue - fairValueBase),
    discountPct: input.result.discountPct,
    raw: input.result.raw,
    confidence: input.result.confidence,
    penalty: input.result.penalty,
    score: input.result.score,
    priceCore: input.result.priceCore,
    total100: input.result.total100,
    factors: input.result.factors,
    firedFlags: Object.entries(input.result.redFlags)
      .filter(([, on]) => on)
      .map(([code]) => ({ code, source: flagSource(code) })),
    redFlags: input.result.redFlags,
    reason: input.result.reason,
    isOpportunity: input.result.isOpportunity,
    disqualified: input.result.disqualified,
    accidentSeverity: input.result.accidentSeverity,
    assessmentConfidence: input.result.assessmentConfidence,
    ...(input.heuristicTableHashes ? { heuristicTableHashes: input.heuristicTableHashes } : {}),
  };
}

/**
 * Upgrade a stored explanation projection without changing its scoring provenance.  V1 still
 * renders normally when no evidence was collected; callers use this only after a durable row is
 * persisted and linked.
 */
export function withProviderEvidence(
  explanation: EvaluationExplanation,
  providerEvidence: ProviderEvidenceReference | null,
): EvaluationExplanationV2 | EvaluationExplanationV3 {
  // Raise a legacy V1 to V2, but never *lower* a newer record — forcing `2` here would silently
  // strip the spec-018 shadow verdict's schema guarantee off a freshly built V3.
  if (explanation.schemaVersion >= 3) {
    return { ...(explanation as EvaluationExplanationV3), providerEvidence };
  }
  return { ...explanation, schemaVersion: 2, providerEvidence };
}

/**
 * Whether a stored explanation carries the `providerEvidence` field. Deliberately a `>=` check:
 * every version from 2 onward has it, and an equality check silently drops provider evidence from
 * `/why` the moment a new schema version ships.
 */
export function isEvaluationExplanationV2(
  explanation: EvaluationExplanation,
): explanation is EvaluationExplanationV2 | EvaluationExplanationV3 {
  return explanation.schemaVersion >= 2;
}

function flagSource(code: string): 'auto-ria' | 'description' | 'derived' {
  if (code.startsWith('desc_')) return 'description';
  if (code === 'suspicious_low_mileage' || code === 'unverified_bargain') return 'derived';
  return 'auto-ria';
}
