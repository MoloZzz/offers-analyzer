/**
 * Spec 018 T009/T010 — the accident-clamp rollout report.
 *
 * Pure aggregation over already-persisted evaluation explanations plus the disappearance record.
 * Zero new requests, zero new capture: everything here was written by the normal poll cycle while
 * the live clamp stayed in force.
 *
 * The question it answers is narrow and deliberately falsifiable: **of the listings the current
 * all-or-nothing accident clamp killed, which ones would graded severity have let through, and what
 * subsequently happened to them?** If those listings reliably went stale, relisted, or cut their
 * price, the clamp was empirically earned and the correct outcome is *not to flip* (ADR-0020).
 */
import { AccidentBucket, AccidentReason } from '../valuation/accident-severity';

/**
 * The disqualifying red-flags that graded severity would replace. `salvage` is deliberately absent:
 * it stays a hard kill in every configuration (FR-002), as does the `severe` bucket. A listing also
 * killed by `suspicious_discount`, `confiscated`, `under_credit` or `desc_not_running` is not
 * suppressed *by the accident clamp* and must not be counted as such.
 */
const ACCIDENT_DISQUALIFIERS = ['damaged', 'desc_after_accident'] as const;

const OTHER_DISQUALIFIERS = [
  'suspicious_discount',
  'salvage',
  'confiscated',
  'under_credit',
  'desc_not_running',
] as const;

export const ACCIDENT_BUCKETS: readonly AccidentBucket[] = [
  'cosmetic',
  'moderate',
  'unknown',
  'severe',
];

/** What happened to a listing after it was evaluated — read from `ListingDisappearance`. */
export interface AccidentShadowOutcome {
  disappeared: boolean;
  isRelist: boolean;
  domDays: number | null;
  hadPriceCut: boolean;
}

/** One evaluated listing that carried an accident verdict. Projected from the stored explanation. */
export interface AccidentShadowRecord {
  listingId: string;
  bucket: AccidentBucket;
  reason: AccidentReason;
  corroborated: boolean;
  /** Whether the live clamp disqualified it (for any reason). */
  disqualified: boolean;
  redFlags: Record<string, boolean>;
  /** Pre-clamp score components, persisted unclamped. */
  raw: number;
  confidence: number;
  penalty: number;
  discountPct: number;
  thresholdUsed: number;
  /** Non-empty only once the spec-003 composite factors are activated; empty in production today. */
  factorCount: number;
  outcome?: AccidentShadowOutcome | null;
}

export interface AccidentBucketStats {
  bucket: AccidentBucket;
  total: number;
  corroborated: number;
  /** Killed by an accident disqualifier and by nothing else. */
  suppressed: number;
  /** Of those, the ones whose pre-clamp price core alone cleared the alert threshold. */
  wouldHaveAlerted: number;
  /** Outcome mix for the would-have-alerted set — the evidence the flip decision turns on. */
  outcomes: AccidentOutcomeStats;
}

export interface AccidentOutcomeStats {
  /** How many of the would-have-alerted listings have a disappearance record at all. */
  observed: number;
  relisted: number;
  hadPriceCut: number;
  medianDomDays: number | null;
}

export interface AccidentShadowDigest {
  hasData: boolean;
  total: number;
  bucketStats: AccidentBucketStats[];
  /** Suppressed by the accident clamp with a non-`severe` verdict, across all buckets. */
  suppressedTotal: number;
  wouldHaveAlertedTotal: number;
  outcomesTotal: AccidentOutcomeStats;
  reasonCounts: Record<string, number>;
  /**
   * True once at least one record carries composite factors, which makes the pre-clamp price core
   * an under-estimate of the would-be score. Surfaced so the digest never quietly overstates.
   */
  factorsActive: boolean;
}

/**
 * A listing is suppressed *by the accident clamp* only when every disqualifier that fired is an
 * accident one. `severe` is excluded because grading keeps killing it — releasing the clamp would
 * not change its fate, so counting it would inflate the case for flipping.
 */
export function isSuppressedByAccidentClamp(record: AccidentShadowRecord): boolean {
  if (!record.disqualified) return false;
  if (record.bucket === 'severe') return false;
  if (OTHER_DISQUALIFIERS.some((code) => record.redFlags[code] === true)) return false;
  return ACCIDENT_DISQUALIFIERS.some((code) => record.redFlags[code] === true);
}

/**
 * The price core the listing would have carried had the clamp not zeroed it: `raw × confidence ×
 * penalty`, exactly the expression `computeValuation` evaluates before `if (disqualified)`. All
 * three inputs are persisted unclamped, so this is a reconstruction, not an estimate — with the
 * composite factors inactive (production today) it equals the would-be score.
 */
export function wouldBePriceCore(record: AccidentShadowRecord): number {
  return Math.round(record.raw * record.confidence * record.penalty * 100) / 100;
}

function wouldHaveAlerted(record: AccidentShadowRecord): boolean {
  const core = wouldBePriceCore(record);
  return core > 0 && core >= record.thresholdUsed;
}

function outcomeStats(records: AccidentShadowRecord[]): AccidentOutcomeStats {
  const outcomes = records.map((r) => r.outcome).filter((o): o is AccidentShadowOutcome => !!o);
  const doms = outcomes
    .map((o) => o.domDays)
    .filter((d): d is number => typeof d === 'number' && Number.isFinite(d))
    .sort((a, b) => a - b);
  return {
    observed: outcomes.length,
    relisted: outcomes.filter((o) => o.isRelist).length,
    hadPriceCut: outcomes.filter((o) => o.hadPriceCut).length,
    medianDomDays: doms.length > 0 ? median(doms) : null,
  };
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(value * 10) / 10;
}

export function buildAccidentShadowDigest(records: AccidentShadowRecord[]): AccidentShadowDigest {
  const suppressed = records.filter(isSuppressedByAccidentClamp);
  const wouldAlert = suppressed.filter(wouldHaveAlerted);

  const bucketStats = ACCIDENT_BUCKETS.map((bucket) => {
    const inBucket = records.filter((r) => r.bucket === bucket);
    const bucketSuppressed = suppressed.filter((r) => r.bucket === bucket);
    const bucketWouldAlert = wouldAlert.filter((r) => r.bucket === bucket);
    return {
      bucket,
      total: inBucket.length,
      corroborated: inBucket.filter((r) => r.corroborated).length,
      suppressed: bucketSuppressed.length,
      wouldHaveAlerted: bucketWouldAlert.length,
      outcomes: outcomeStats(bucketWouldAlert),
    };
  });

  const reasonCounts: Record<string, number> = {};
  for (const r of records) reasonCounts[r.reason] = (reasonCounts[r.reason] ?? 0) + 1;

  return {
    hasData: records.length > 0,
    total: records.length,
    bucketStats,
    suppressedTotal: suppressed.length,
    wouldHaveAlertedTotal: wouldAlert.length,
    outcomesTotal: outcomeStats(wouldAlert),
    reasonCounts,
    factorsActive: records.some((r) => r.factorCount > 0),
  };
}
