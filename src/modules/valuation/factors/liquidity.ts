/**
 * Liquidity factor (spec 003 US1). How easily a model resells: a deep discount on an illiquid
 * model (Jaguar XF, Citroën C6) can sit for months — no profit — while a fair discount on a liquid
 * one (Camry, Octavia) is the better real deal. Classification lives in the versioned
 * `liquidity-tiers.json`; the *magnitude* (how much a tier moves the score) is the ParameterSet
 * bound, so it's tunable/rollbackable. Pure + deterministic.
 */
import { FactorBound, FactorScore, toSubScore100 } from './factor';
import { LiquidityTable, LiquidityTier } from './tables';

export interface LiquidityInput {
  make?: string;
  model?: string;
}

const TIER_REASON: Record<LiquidityTier, string> = {
  A: 'популярна модель, високий попит — легко перепродати',
  B: 'ліквідна модель — продається впевнено',
  C: 'середня ліквідність',
  D: 'рідкісна/неліквідна модель — важко перепродати',
};

/**
 * Returns the liquidity contribution, or `null` when the factor is off (no ParameterSet bounds or no
 * table) or the listing lacks make/model. An assessable-but-unlisted model yields a neutral modifier
 * *with a reason* ("ліквідність невідома") — never a fabricated tier (US1 acceptance #2).
 */
export function liquidityFactor(
  input: LiquidityInput,
  table?: LiquidityTable,
  bounds?: FactorBound,
): FactorScore | null {
  if (!bounds || !table) return null; // gated off via the active ParameterSet / missing table
  const make = input.make?.trim().toLowerCase();
  const model = input.model?.trim().toLowerCase();
  if (!make || !model) return null; // no data → neutral (omitted)

  const tier = table.models[`${make}|${model}`] ?? table.makes[make];
  if (!tier) {
    return { factor: 'liquidity', modifier: 1, subScore100: toSubScore100(1), reasons: ['ліквідність невідома'] };
  }
  const modifier = tierModifier(tier, bounds);
  return {
    factor: 'liquidity',
    modifier,
    subScore100: toSubScore100(modifier),
    reasons: [TIER_REASON[tier]],
  };
}

/** Map a tier onto a modifier inside the ParameterSet bounds: A→max, D→min, C→neutral, B→halfway up. */
function tierModifier(tier: LiquidityTier, bounds: FactorBound): number {
  switch (tier) {
    case 'A':
      return bounds.max;
    case 'B':
      return 1 + (bounds.max - 1) / 2;
    case 'C':
      return 1;
    case 'D':
      return bounds.min;
  }
}
