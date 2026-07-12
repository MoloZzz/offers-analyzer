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
