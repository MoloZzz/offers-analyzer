import { Currency } from '../../common/types/money';
import { ListingDetail } from '../sources/ports/listing-source.port';

import { ResolvedBenchmark } from './cohort';
import { FactorScore } from './factors/factor';
import {
  ValuationComparability,
  ValuationEvidenceStatus,
  ValuationEvidenceTarget,
  ValuationQueryMode,
} from './valuation-evidence.types';
import { ValuationResult } from './valuation.service';

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

export type EvaluationExplanation = EvaluationExplanationV1 | EvaluationExplanationV2;

export function buildEvaluationExplanation(input: {
  detail: ListingDetail;
  benchmark: ResolvedBenchmark | null;
  fairValue: number;
  result: ValuationResult;
  parameterSetVersion: number;
  thresholdUsed: number;
  evaluatedAt?: Date;
}): EvaluationExplanationV1 {
  const fairValueBase = input.benchmark?.value.amount ?? 0;
  return {
    schemaVersion: 1,
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
): EvaluationExplanationV2 {
  return {
    ...explanation,
    schemaVersion: 2,
    providerEvidence,
  };
}

export function isEvaluationExplanationV2(
  explanation: EvaluationExplanation,
): explanation is EvaluationExplanationV2 {
  return explanation.schemaVersion === 2;
}

function flagSource(code: string): 'auto-ria' | 'description' | 'derived' {
  if (code.startsWith('desc_')) return 'description';
  if (code === 'suspicious_low_mileage' || code === 'unverified_bargain') return 'derived';
  return 'auto-ria';
}
