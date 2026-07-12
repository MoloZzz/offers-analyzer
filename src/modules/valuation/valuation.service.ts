import { Injectable } from '@nestjs/common';

import { SellerType } from '../sources/ports/listing-source.port';

import { evaluateRedFlags } from './red-flags';

export interface ValuationInput {
  asking: number;
  fairValue: number;
  sampleSize: number;
  thresholdPct: number;
  minSamples: number;
  sellerType: SellerType;
  hasVinReport: boolean;
}

export interface ValuationResult {
  isOpportunity: boolean;
  discountPct: number;
  confidence: number;
  score: number;
  redFlags: Record<string, boolean>;
  /** Human-readable reason the listing was or wasn't flagged (used in alerts/logs). */
  reason: string;
}

/**
 * The heart of the product: decide whether a listing is a below-market opportunity.
 * Pure and deterministic (no IO) so it is fully unit-testable — constitution §VI.
 * Methodology: knowledge-offers-analyzer/research/profitability-definition.md.
 */
@Injectable()
export class ValuationService {
  evaluate(input: ValuationInput): ValuationResult {
    const discountPct =
      input.fairValue > 0 ? ((input.fairValue - input.asking) / input.fairValue) * 100 : 0;

    const confidence =
      input.minSamples > 0 ? Math.min(1, input.sampleSize / (input.minSamples * 2)) : 0;

    const { flags, disqualified } = evaluateRedFlags({
      discountPct,
      sellerType: input.sellerType,
      hasVinReport: input.hasVinReport,
    });

    const meetsDiscount = discountPct >= input.thresholdPct;
    const meetsConfidence = input.sampleSize >= input.minSamples;
    const isOpportunity = meetsDiscount && meetsConfidence && !disqualified;

    const score = isOpportunity ? (discountPct / 100) * confidence : 0;

    return {
      isOpportunity,
      discountPct: round(discountPct),
      confidence: round(confidence),
      score: round(score),
      redFlags: flags,
      reason: reasonFor({ meetsDiscount, meetsConfidence, disqualified, isOpportunity }),
    };
  }
}

function reasonFor(p: {
  meetsDiscount: boolean;
  meetsConfidence: boolean;
  disqualified: boolean;
  isOpportunity: boolean;
}): string {
  if (p.isOpportunity) return 'below fair value with sufficient data and no disqualifying flags';
  if (!p.meetsDiscount) return 'discount below threshold';
  if (!p.meetsConfidence) return 'insufficient comparable data (low confidence)';
  if (p.disqualified) return 'disqualified by a risk red-flag';
  return 'not an opportunity';
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
