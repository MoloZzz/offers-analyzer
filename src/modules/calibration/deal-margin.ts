/**
 * Realized-margin math for post-deal outcomes (SPEC-007 US7.2) — pure, IO-free, unit-testable.
 * The service persists raw operator inputs; these functions turn a deal into money (margin, DOM)
 * and aggregate closed deals into the numbers `/report` and `/deals` show. Nothing is stored
 * derived, so there is no denormalized field to drift.
 */
import { DealStage } from './entities/deal-outcome.entity';

/** The economics the operator can supply for a deal (any subset). */
export interface DealEconomics {
  buyPriceUsd?: number | null;
  actualCostsUsd?: number | null;
  sellPriceUsd?: number | null;
}

/** Timing inputs for realized days-on-market. */
export interface DealTiming {
  daysOnMarket?: number | null;
  boughtAt?: Date | null;
  soldAt?: Date | null;
}

/** A partial update applied to a deal row via upsert (from a button tap or `/deal`). */
export interface DealPatch {
  buyPriceUsd?: number | null;
  actualCostsUsd?: number | null;
  sellPriceUsd?: number | null;
  daysOnMarket?: number | null;
  declineReason?: string | null;
  note?: string | null;
  /**
   * Explicit operator action from a button tap (🛒 Купив / ❌ Відмова), independent of any price.
   * A `'bought'` intent overrides an earlier decline; a `'declined'` intent never overrides a
   * bought/sold deal. Never set by `/deal` arg parsing — buttons only.
   */
  intent?: DealStage;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Realized margin = sell − buy − costs (costs default 0). Null unless BOTH buy and sell prices
 * are present — an incomplete deal has no margin (never counted as a $0 outcome). Negative margin
 * is valid and returned (the whole point of the loss-making metric).
 */
export function realizedMargin(d: DealEconomics): number | null {
  if (d.buyPriceUsd == null || d.sellPriceUsd == null) return null;
  const costs = d.actualCostsUsd ?? 0;
  return d.sellPriceUsd - d.buyPriceUsd - costs;
}

/**
 * Realized days-on-market. Operator-entered `daysOnMarket` wins; otherwise derive from
 * `soldAt − boughtAt` (rounded to whole days, never negative); null when neither is available.
 */
export function realizedDom(t: DealTiming): number | null {
  if (t.daysOnMarket != null) return t.daysOnMarket;
  if (t.boughtAt != null && t.soldAt != null) {
    return Math.max(0, Math.round((t.soldAt.getTime() - t.boughtAt.getTime()) / DAY_MS));
  }
  return null;
}

/**
 * Monotonic stage derivation. A deal only ever moves forward:
 * - a sell price ⇒ `sold`;
 * - a buy price ⇒ `bought`, unless already sold;
 * - a decline reason ⇒ `declined`, unless already bought/sold (buying overrides an earlier decline);
 * - otherwise the current stage is kept.
 * `current` is null for a brand-new row.
 */
export function deriveStage(current: DealStage | null, patch: DealPatch): DealStage {
  const base: DealStage | null = current;
  if (patch.sellPriceUsd != null || patch.intent === 'sold' || base === 'sold') return 'sold';
  if (patch.buyPriceUsd != null || patch.intent === 'bought' || base === 'bought') return 'bought';
  if (patch.declineReason != null || patch.intent === 'declined' || base === 'declined') {
    return 'declined';
  }
  // No signal yet and no prior stage: a bare `/deal <link>` with no fields is treated as an
  // intent to buy (the operator is tracking the deal), so default to 'bought'.
  return 'bought';
}

export interface MarginStats {
  /** Number of closed deals (buy + sell both present) folded into the medians. */
  closed: number;
  medianMarginUsd: number | null;
  /** Share (0..1) of closed deals with margin < 0; null when there are no closed deals. */
  lossShare: number | null;
  medianDom: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(m * 100) / 100;
}

/**
 * Aggregate closed deals into median margin, loss-making share, and median realized DOM.
 * Deals without a computable margin are excluded from every statistic.
 */
export function marginStats(deals: Array<DealEconomics & DealTiming>): MarginStats {
  const margins: number[] = [];
  const doms: number[] = [];
  let losses = 0;
  for (const d of deals) {
    const m = realizedMargin(d);
    if (m == null) continue;
    margins.push(m);
    if (m < 0) losses += 1;
    const dom = realizedDom(d);
    if (dom != null) doms.push(dom);
  }
  return {
    closed: margins.length,
    medianMarginUsd: median(margins),
    lossShare: margins.length === 0 ? null : Math.round((losses / margins.length) * 100) / 100,
    medianDom: median(doms),
  };
}
