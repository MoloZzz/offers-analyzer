/**
 * Pure threshold auto-calibration logic (spec 002, E3a): given the current population of
 * recorded deal scores and a realized precision, propose a new `minDealScore` threshold.
 * PROPOSE-ONLY — this module never mutates anything; callers decide whether/how to apply.
 */

export interface CalibrationTarget {
  /** Desired min # of qualifying listings (scores >= threshold). */
  minVolume?: number;
  /** Desired max # of qualifying listings (scores >= threshold). */
  maxVolume?: number;
  /** Minimum acceptable median realized margin in USD. */
  minMedianMarginUsd?: number;
  /** Maximum acceptable share (0..1) of loss-making closed deals. */
  maxLossShare?: number;
}

export interface CalibrationInput {
  /** All recorded lastScores (population for volume projection). */
  scores: number[];
  currentThreshold: number;
  /** Closed, alert-linked deals for this profile. */
  closedDealCount: number;
  medianMarginUsd: number | null;
  lossShare: number | null;
}

export interface ThresholdProposal {
  /** null = no change (frozen, or already on target). */
  proposed: number | null;
  /** # of scores >= (proposed ?? currentThreshold). */
  projectedVolume: number;
  reason: string;
}

/** Max threshold change per run (bounded). */
export const MAX_STEP = 0.1;
/** Freeze below this many scores. */
export const MIN_SCORES = 20;
/** Economic evidence needs at least this many closed deals. */
export const MIN_CLOSED_DEALS = 15;

function volumeAt(scores: number[], t: number): number {
  return scores.filter((s) => s >= t).length;
}

/** The score at position `n` when sorted descending (clamp `n` to `[1, scores.length]`). */
function nthHighest(scores: number[], n: number): number {
  const clampedN = Math.max(1, Math.min(n, scores.length));
  const sorted = [...scores].sort((a, b) => b - a);
  return sorted[clampedN - 1];
}

function clampToStep(currentThreshold: number, t: number): number {
  const bounded = Math.max(currentThreshold - MAX_STEP, Math.min(currentThreshold + MAX_STEP, t));
  const clamped = Math.max(0, Math.min(1, bounded));
  return Math.round(clamped * 100) / 100;
}

export function proposeThreshold(input: CalibrationInput, target: CalibrationTarget): ThresholdProposal {
  const { scores, currentThreshold, closedDealCount, medianMarginUsd, lossShare } = input;

  if (scores.length < MIN_SCORES) {
    return {
      proposed: null,
      projectedVolume: volumeAt(scores, currentThreshold),
      reason: 'замало даних для калібрування',
    };
  }

  if (closedDealCount < MIN_CLOSED_DEALS) {
    return {
      proposed: null,
      projectedVolume: volumeAt(scores, currentThreshold),
      reason: `недостатньо закритих угод: ${closedDealCount}/${MIN_CLOSED_DEALS}`,
    };
  }

  let t: number;
  let reason: string;

  if (
    (target.minMedianMarginUsd != null && medianMarginUsd != null && medianMarginUsd < target.minMedianMarginUsd) ||
    (target.maxLossShare != null && lossShare != null && lossShare > target.maxLossShare)
  ) {
    t = currentThreshold + MAX_STEP;
    reason = `економіка поза ціллю — піднімаємо поріг`;
  } else {
    const vol = volumeAt(scores, currentThreshold);
    if (target.maxVolume != null && vol > target.maxVolume) {
      t = nthHighest(scores, target.maxVolume);
      reason = `забагато кандидатів (${vol} > ${target.maxVolume}) — піднімаємо поріг`;
    } else if (target.minVolume != null && vol < target.minVolume) {
      t = nthHighest(scores, target.minVolume);
      reason = `замало кандидатів (${vol} < ${target.minVolume}) — знижуємо поріг`;
    } else {
      return {
        proposed: null,
        projectedVolume: vol,
        reason: 'у межах цілі — без змін',
      };
    }
  }

  const bounded = clampToStep(currentThreshold, t);

  if (Math.abs(bounded - currentThreshold) < 0.01) {
    return {
      proposed: null,
      projectedVolume: volumeAt(scores, currentThreshold),
      reason: `${reason} (зміна незначна — без змін)`,
    };
  }

  return {
    proposed: bounded,
    projectedVolume: volumeAt(scores, bounded),
    reason,
  };
}
