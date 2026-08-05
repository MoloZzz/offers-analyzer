/**
 * Value objects for the shared evaluation breakdown (spec 016 US16.1).
 *
 * Pure and presentation-agnostic: no Telegram, no Nest, no formatting decisions beyond the label /
 * value split. Every surface — the `Деталі` button, `/why`, `/check` — consumes these rather than
 * growing its own subset, which is the drift this spec exists to stop.
 */

/**
 * Whether the parameter is actually carried by the record being rendered.
 *
 * `unavailable` is a first-class state, not an error: an old schema version, an inactive factor, or
 * an output that has not shipped yet are all legitimate absences. They MUST be stated with a reason
 * and MUST NOT be rendered as `0` or as a bare dash (FR-004) — a fabricated value is worse than a
 * stated gap, because the operator cannot tell the two apart afterwards.
 */
export type BreakdownAvailability = 'available' | 'unavailable';

/** Sections in decision order — most decisive first, so a split message front-loads what matters. */
export type BreakdownSectionKey =
  | 'identity'
  | 'price'
  | 'cohort'
  | 'mileage'
  | 'provider'
  | 'score'
  | 'factors'
  | 'flags'
  | 'confidence'
  | 'monetary'
  | 'verdict';

export interface BreakdownLine {
  /**
   * Empty for a continuation line that belongs to the line above it (a confidence reason, a
   * provider-evidence detail). The renderer emits the bare value for those, which is what keeps the
   * refactored `/why` output byte-compatible with the hand-written one it replaced.
   */
  label: string;
  value: string;
  availability: BreakdownAvailability;
  /** Why the parameter is absent. Always set when `availability` is `unavailable`. */
  reason?: string;
}

export interface BreakdownSection {
  key: BreakdownSectionKey;
  title: string;
  lines: BreakdownLine[];
}

export interface Breakdown {
  sections: BreakdownSection[];
  /**
   * The evaluation this breakdown reflects — the alert's snapshot, not the newest one. `null` for a
   * live computation that has not been persisted.
   */
  evaluatedAt: string | null;
  parameterSetVersion: number | null;
  /** Explanation schema version, or `0` for a live computation that was never persisted. */
  schemaVersion: number;
}

export function availableLine(label: string, value: string): BreakdownLine {
  return { label, value, availability: 'available' };
}

/** A stated gap. `reason` is required by the signature so an unexplained absence cannot be built. */
export function unavailableLine(label: string, value: string, reason: string): BreakdownLine {
  return { label, value, availability: 'unavailable', reason };
}

/** A prose continuation of the line above it — carries no label of its own. */
export function proseLine(value: string): BreakdownLine {
  return { label: '', value, availability: 'available' };
}
