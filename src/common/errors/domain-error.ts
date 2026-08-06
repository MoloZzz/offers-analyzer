/** Base class for expected, handled domain failures (constitution §III: errors are values you handle). */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The source request budget for the current window is exhausted (FR-012). */
export class RateBudgetExhaustedError extends DomainError {}

/** A listing source (e.g. AUTO.RIA API) is unavailable or errored (FR-012). */
export class SourceUnavailableError extends DomainError {}

/**
 * The source answered, and its answer is "no data for this query" — AUTO.RIA returns HTTP 400
 * `{message:"Not Enough Data"}` for a thin cohort. A subtype of unavailability so existing handlers
 * keep working, but distinguishable where an empty result is more useful than an error: a caller
 * that turns it into a zero-sample value lets the 24h cache remember the emptiness instead of
 * re-spending budget on the same barren cohort for every listing that matches it.
 */
export class SourceNoDataError extends SourceUnavailableError {}
