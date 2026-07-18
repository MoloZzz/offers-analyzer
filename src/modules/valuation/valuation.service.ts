import { Injectable } from '@nestjs/common';

import { DEFAULT_UPLIFT_CAP, ScoringParams } from '../calibration/entities/parameter-set.entity';
import { ParametersService } from '../calibration/parameters.service';
import { SellerType } from '../sources/ports/listing-source.port';

import { assessCondition } from './condition';
import { composeFactors, FactorScore, toTotal100 } from './factors/factor';
import { assessMileageRisk } from './mileage-risk';
import { evaluateRedFlags } from './red-flags';

export interface ValuationInput {
  asking: number;
  fairValue: number;
  sampleSize: number;
  minSamples: number;
  /** Minimum deal score (−1..1) for a listing to count as an Opportunity (profile config). */
  minScore: number;
  sellerType: SellerType;
  hasVinReport: boolean;
  damaged?: boolean;
  salvage?: boolean;
  unclearCustoms?: boolean;
  confiscated?: boolean;
  underCredit?: boolean;
  abroad?: boolean;
  /** Seller description — scanned for condition red-flags (after-accident, non-runner, etc.). */
  description?: string;
  /** Claimed mileage, thousand km — feeds odometer-fraud heuristics (see mileage-risk.ts). */
  mileageK?: number;
  /** Model year — feeds odometer-fraud heuristics (see mileage-risk.ts). */
  year?: number;
  /** Whether AUTO.RIA reports an independent VIN check (distinct from a full VIN report). */
  vinChecked?: boolean;
}

export interface ValuationResult {
  isOpportunity: boolean;
  /** Informational: how far below fair value, in percent. */
  discountPct: number;
  /** 0..1 — how much comparable data backs the fair value. */
  confidence: number;
  /** Signed deal score in [−1, 1]: −1 overpriced/trap, 0 at market/unknown, +1 clearly below market. */
  score: number;
  redFlags: Record<string, boolean>;
  reason: string;
  /** Raw discount-derived score in [−1, 1], before confidence/penalty are applied. */
  raw: number;
  /** Multiplicative penalty in (0, 1] applied for soft red-flags. */
  penalty: number;
  /** Whether a hard red-flag disqualified this listing regardless of score. */
  disqualified: boolean;
  /**
   * Price core `raw × confidence × penalty` (disqualifiers clamp ≤ 0), before composite factor
   * modifiers. Equals `score` in Phase F (no factors). Price dominance gates on this being > 0.
   */
  priceCore: number;
  /** Per-factor composite-score contributions (spec 003). Empty until factors ship. */
  factors: FactorScore[];
  /** Presentation-only 0–100 "Total Deal Score" derived from `score`. */
  total100: number;
}

/**
 * The heart of the product: score how good/bad a listing's price is as a deal.
 * Pure and deterministic (no IO) so it is fully unit-testable — constitution §VI.
 * Methodology: knowledge-offers-analyzer/research/profitability-definition.md.
 */
export function computeValuation(input: ValuationInput, params: ScoringParams): ValuationResult {
  const fairValue = Number.isFinite(input.fairValue) ? input.fairValue : 0;
  const discountPct =
    fairValue > 0 ? ((fairValue - input.asking) / fairValue) * 100 : 0;

  const raw = clamp(discountPct / params.scale, -1, 1);
  const confidence =
    input.minSamples > 0 ? Math.min(1, input.sampleSize / (input.minSamples * 2)) : 0;

  const condition = assessCondition(input.description);
  const mileageRisk = assessMileageRisk({
    mileageK: input.mileageK,
    year: input.year,
    discountPct,
    hasVinReport: input.hasVinReport,
    vinChecked: input.vinChecked,
  });
  const { flags, disqualified, penalty } = evaluateRedFlags(
    {
      discountPct,
      sellerType: input.sellerType,
      hasVinReport: input.hasVinReport,
      damaged: input.damaged,
      salvage: input.salvage,
      unclearCustoms: input.unclearCustoms,
      confiscated: input.confiscated,
      underCredit: input.underCredit,
      abroad: input.abroad,
      afterAccident: condition.afterAccident,
      notRunning: condition.notRunning,
      needsRepair: condition.needsRepair,
      mechanicalIssue: condition.mechanicalIssue,
      suspiciousLowMileage: mileageRisk.suspiciousLowMileage,
      unverifiedBargain: mileageRisk.unverifiedBargain,
    },
    params.softFlagPenalty,
  );

  // Price core: the pre-003 score. A disqualifier clamps it ≤ 0 (a scam/damaged bargain is not a deal).
  let priceCore = raw * confidence * penalty;
  if (disqualified) priceCore = Math.min(priceCore, 0);

  // Composite factors (spec 003). None ship in Phase F, so Π = 1 and score === priceCore (SC-001).
  const factors: FactorScore[] = [];
  const upliftCap = params.upliftCap ?? DEFAULT_UPLIFT_CAP;
  const score = composeFactors(priceCore, factors, upliftCap);

  const hasEnoughData = input.sampleSize >= input.minSamples;
  // Price dominance: non-price factors can rank but never qualify an at/above-market listing.
  const isOpportunity =
    score >= input.minScore && hasEnoughData && !disqualified && priceCore > 0;

  return {
    isOpportunity,
    discountPct: round(discountPct),
    confidence: round(confidence),
    score: round(score),
    redFlags: flags,
    reason: reasonFor({ isOpportunity, disqualified, hasEnoughData, score, minScore: input.minScore }),
    raw: round(raw),
    penalty: round(penalty),
    disqualified,
    priceCore: round(priceCore),
    factors,
    total100: toTotal100(score),
  };
}

@Injectable()
export class ValuationService {
  constructor(private readonly parameters: ParametersService) {}

  evaluate(input: ValuationInput): ValuationResult {
    return computeValuation(input, this.parameters.params());
  }
}

function reasonFor(p: {
  isOpportunity: boolean;
  disqualified: boolean;
  hasEnoughData: boolean;
  score: number;
  minScore: number;
}): string {
  if (p.isOpportunity) return `deal score ${round(p.score)} ≥ threshold ${p.minScore}`;
  if (p.disqualified) return 'disqualified by a risk red-flag';
  if (!p.hasEnoughData) return 'insufficient comparable data (low confidence)';
  return `deal score ${round(p.score)} below threshold ${p.minScore}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
