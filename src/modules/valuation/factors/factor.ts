/**
 * Composite Total Deal Score — factor machinery (spec 003, Phase F).
 *
 * The score becomes `priceCore × Π(factor modifiers)`, where each factor contributes a bounded,
 * multiplicative `modifier` (1.0 = neutral / unknown). Foundational phase ships with **no factors**,
 * so the composition is behavior-identical to the pre-003 price core (SC-001). Real factors
 * (liquidity, repair-risk, negotiation, seller, positives) land in later phases, each neutral until
 * shipped and each reading only already-fetched data.
 *
 * ADR-0006 invariants enforced here:
 *  - **Price stays dominant** — the product of *uplifting* modifiers is hard-capped (`upliftCap`),
 *    so non-price factors can rank but never rescue an at/above-market listing.
 *  - **Graceful degradation** — an unknown factor is simply absent (or modifier 1.0); Π over no
 *    factors is exactly 1.0.
 *  - **Explainable** — every factor carries a 0–100 sub-score and human-readable reasons.
 *
 * Pure + deterministic (no IO) → fully unit-testable.
 */

/** One factor's contribution to the composite score. */
export interface FactorScore {
  /** Stable factor key, e.g. 'liquidity', 'repair_risk'. */
  factor: string;
  /** Multiplicative modifier applied to the price core. 1.0 = neutral. */
  modifier: number;
  /** Presentation-only 0–100 sub-score derived from the modifier. */
  subScore100: number;
  /** Signed, human-readable reasons for `/why` and the alert (e.g. '+ full service history'). */
  reasons: string[];
}

/** Per-factor modifier bounds (from the active ParameterSet). */
export interface FactorBound {
  min: number;
  max: number;
}

/**
 * Compose the price core with per-factor modifiers under the price-dominance cap.
 *
 * Dampeners (modifier < 1) always apply in full — a risk should never be capped away. Uplifts
 * (modifier > 1) are multiplied together and the *combined* uplift is clamped to `upliftCap`, so no
 * stack of positive factors can inflate the score past the bound. With an empty factor list this
 * returns `priceCore` unchanged (exact), which is what makes Phase F behavior-identical.
 */
export function composeFactors(
  priceCore: number,
  factors: FactorScore[],
  upliftCap: number,
): number {
  let uplift = 1;
  let damp = 1;
  for (const f of factors) {
    if (f.modifier >= 1) uplift *= f.modifier;
    else damp *= f.modifier;
  }
  const cappedUplift = Math.min(uplift, upliftCap);
  return priceCore * cappedUplift * damp;
}

/** Map the signed deal score ∈ [−1, 1] to a 0–100 "Total Deal Score" (at-market ⇒ 50). */
export function toTotal100(score: number): number {
  return clamp(Math.round(((score + 1) / 2) * 100), 0, 100);
}

/**
 * Map a factor modifier (centered on 1.0) to a 0–100 sub-score for presentation. Neutral ⇒ 50;
 * a ±10% modifier maps to ~100 / ~0. Presentation only — never feeds scoring.
 */
export function toSubScore100(modifier: number): number {
  return clamp(Math.round(50 + (modifier - 1) * 500), 0, 100);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
