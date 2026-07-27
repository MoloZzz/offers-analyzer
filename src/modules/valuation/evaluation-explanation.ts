import { Currency } from '../../common/types/money';
import { ListingDetail } from '../sources/ports/listing-source.port';

import { ResolvedBenchmark } from './cohort';
import { FactorScore } from './factors/factor';
import { ValuationResult } from './valuation.service';

export interface EvaluationExplanation {
  schemaVersion: 1;
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

export function buildEvaluationExplanation(input: {
  detail: ListingDetail;
  benchmark: ResolvedBenchmark | null;
  fairValue: number;
  result: ValuationResult;
  parameterSetVersion: number;
  thresholdUsed: number;
  evaluatedAt?: Date;
}): EvaluationExplanation {
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

function flagSource(code: string): 'auto-ria' | 'description' | 'derived' {
  if (code.startsWith('desc_')) return 'description';
  if (code === 'suspicious_low_mileage' || code === 'unverified_bargain') return 'derived';
  return 'auto-ria';
}
