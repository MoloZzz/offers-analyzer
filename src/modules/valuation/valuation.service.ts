import { Injectable } from '@nestjs/common';

import { SellerType } from '../sources/ports/listing-source.port';

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
}

/** A discount of this percent (below fair value) saturates the raw score to ~1.0. */
const DEAL_SCORE_SCALE_PCT = 30;

/**
 * The heart of the product: score how good/bad a listing's price is as a deal.
 * Pure and deterministic (no IO) so it is fully unit-testable — constitution §VI.
 * Methodology: knowledge-offers-analyzer/research/profitability-definition.md.
 */
@Injectable()
export class ValuationService {
  evaluate(input: ValuationInput): ValuationResult {
    const fairValue = Number.isFinite(input.fairValue) ? input.fairValue : 0;
    const discountPct =
      fairValue > 0 ? ((fairValue - input.asking) / fairValue) * 100 : 0;

    const raw = clamp(discountPct / DEAL_SCORE_SCALE_PCT, -1, 1);
    const confidence =
      input.minSamples > 0 ? Math.min(1, input.sampleSize / (input.minSamples * 2)) : 0;

    const { flags, disqualified, penalty } = evaluateRedFlags({
      discountPct,
      sellerType: input.sellerType,
      hasVinReport: input.hasVinReport,
      damaged: input.damaged,
      salvage: input.salvage,
      unclearCustoms: input.unclearCustoms,
      confiscated: input.confiscated,
      underCredit: input.underCredit,
      abroad: input.abroad,
    });

    let score = raw * confidence * penalty;
    if (disqualified) score = Math.min(score, 0); // a scam/damaged bargain is not a deal

    const hasEnoughData = input.sampleSize >= input.minSamples;
    const isOpportunity = score >= input.minScore && hasEnoughData && !disqualified;

    return {
      isOpportunity,
      discountPct: round(discountPct),
      confidence: round(confidence),
      score: round(score),
      redFlags: flags,
      reason: reasonFor({ isOpportunity, disqualified, hasEnoughData, score, minScore: input.minScore }),
    };
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
