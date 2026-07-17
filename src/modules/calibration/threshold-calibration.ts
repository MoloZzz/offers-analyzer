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
  /** Desired floor on realized precision (0..1). */
  minPrecision?: number;
}

export interface CalibrationInput {
  /** All recorded lastScores (population for volume projection). */
  scores: number[];
  currentThreshold: number;
  /** Realized precision (0..1) or null when there is no labeled data. */
  precision: number | null;
  /** # of 👍/👎 labels behind `precision`. */
  labeledCount: number;
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
/** Precision rule needs at least this many labels. */
export const MIN_LABELED = 10;

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
  const { scores, currentThreshold, precision, labeledCount } = input;

  if (scores.length < MIN_SCORES) {
    return {
      proposed: null,
      projectedVolume: volumeAt(scores, currentThreshold),
      reason: 'замало даних для калібрування',
    };
  }

  let t: number;
  let reason: string;

  if (
    target.minPrecision != null &&
    labeledCount >= MIN_LABELED &&
    precision != null &&
    precision < target.minPrecision
  ) {
    t = currentThreshold + MAX_STEP;
    reason = `реальна точність ${precision} < цілі ${target.minPrecision} — піднімаємо поріг`;
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
