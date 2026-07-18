/**
 * Pure weight-learning (spec 002, E4/US3), propose-only. Learns the global soft-flag penalty from
 * labeled outcomes: if listings where ≥1 soft flag fired have a higher 👎 rate than those with none,
 * strengthen the penalty (lower it); if not, weaken it (raise toward 1.0). Simple statistics, bounded,
 * frozen on thin data — no ML, fully explainable.
 */
export interface WeightSample {
  softFlagsFired: number; // how many soft red-flags fired for this labeled opportunity
  good: boolean;          // the manual outcome: true = 👍, false = 👎
}

export interface WeightEvidence {
  withFlags: { count: number; badRate: number };
  withoutFlags: { count: number; badRate: number };
}

export interface WeightProposal {
  proposedSoftFlagPenalty: number | null; // null = no change (frozen or no signal)
  reason: string;
  evidence: WeightEvidence | null;         // null only when frozen for thin data
}

export const WEIGHT_MAX_STEP = 0.05;  // max change per run
export const WEIGHT_MIN_GROUP = 8;    // min labeled samples required in EACH group
export const PENALTY_MIN = 0.5;
export const PENALTY_MAX = 1.0;
const MARGIN = 0.1;                    // bad-rate gap needed to act

function badRate(samples: WeightSample[]): number {
  if (samples.length === 0) return 0;
  return samples.filter((s) => !s.good).length / samples.length;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function proposeSoftFlagPenalty(samples: WeightSample[], current: number): WeightProposal {
  const withFlags = samples.filter((s) => s.softFlagsFired >= 1);
  const withoutFlags = samples.filter((s) => s.softFlagsFired === 0);
  if (withFlags.length < WEIGHT_MIN_GROUP || withoutFlags.length < WEIGHT_MIN_GROUP) {
    return { proposedSoftFlagPenalty: null, reason: 'замало даних для навчання ваги', evidence: null };
  }
  const evidence: WeightEvidence = {
    withFlags: { count: withFlags.length, badRate: round(badRate(withFlags)) },
    withoutFlags: { count: withoutFlags.length, badRate: round(badRate(withoutFlags)) },
  };
  const diff = evidence.withFlags.badRate - evidence.withoutFlags.badRate;
  let proposed: number;
  let reason: string;
  if (diff > MARGIN) {
    proposed = clamp(current - WEIGHT_MAX_STEP, PENALTY_MIN, PENALTY_MAX);
    reason = `м'які прапорці корелюють з 👎 (${evidence.withFlags.badRate} проти ${evidence.withoutFlags.badRate}) — посилюємо штраф`;
  } else if (diff < -MARGIN) {
    proposed = clamp(current + WEIGHT_MAX_STEP, PENALTY_MIN, PENALTY_MAX);
    reason = `м'які прапорці не корелюють з 👎 (${evidence.withFlags.badRate} проти ${evidence.withoutFlags.badRate}) — послаблюємо штраф`;
  } else {
    return { proposedSoftFlagPenalty: null, reason: 'нема чіткого сигналу — без змін', evidence };
  }
  const rounded = Math.round(proposed * 100) / 100;
  if (Math.abs(rounded - current) < 0.001) {
    return { proposedSoftFlagPenalty: null, reason: `${reason} (зміна незначна)`, evidence };
  }
  return { proposedSoftFlagPenalty: rounded, reason, evidence };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
