/**
 * SPEC-017 value objects. Everything here is advisory by construction: no type in this file is
 * reachable from `ValuationResult`, `ScoringParams`, or any alert decision, and `valuation` must
 * never import it (ADR-0019 §1, enforced by `test/unit/analysis-module-boundary.spec.ts`).
 */

/** One structured fact handed to the model. `null` means explicitly unavailable, never guessed. */
export interface AnalysisFact {
  key: string;
  value: string | null;
}

/** Reference to the persisted evaluation this analysis was assembled from, if there was one. */
export interface AnalysisExplanationRef {
  present: boolean;
  evaluatedAt?: string;
  parameterSetVersion?: number;
}

/**
 * The assembled request. `instructions` is byte-identical to the policy template for its
 * `promptVersion`; every character of seller text lives inside `untrustedBlock` and nowhere else.
 */
export interface AnalysisRequestContext {
  promptVersion: string;
  schemaVersion: number;
  facts: AnalysisFact[];
  explanationRef: AnalysisExplanationRef;
  /** The seller description exactly as stored, or `null` when the listing carries none. */
  untrustedText: string | null;
  /** Delimited quoted third-party text, or an explicit unavailability note when there is none. */
  untrustedBlock: string;
  /** Instruction section — fixed per prompt version, never interpolated with seller text. */
  instructions: string;
  /** Facts block + untrusted block. The only part that varies with listing content. */
  userContent: string;
  inputFactHash: string;
}

export type AnalysisWarningSeverity = 'low' | 'medium' | 'high';

export interface AnalysisWarning {
  code: string;
  severity: AnalysisWarningSeverity;
  rationale: string;
  /** Model-estimated repair cost in USD. Never negative; absent when the model gave none. */
  estimatedCostUsd?: number;
}

/**
 * Validated model answer. It is rendered and stored; it is never read by anything that scores.
 * `reliabilityNotes` are model claims — rendered labelled and unverified (FR-011).
 */
export interface AnalysisOutput {
  warnings: AnalysisWarning[];
  inspectionChecklist: string[];
  sellerQuestions: string[];
  advisoryScore: number;
  advisoryScoreRationale: string;
  reliabilityNotes: string[];
}

/**
 * Terminal state of one invocation. Every one of these is persisted (FR-008).
 *
 * `cached` is a **marker**: an invocation served from a stored answer, carrying no `output` of its
 * own (the record it served already holds it). It exists so `/ai_audit` can report a cache-hit rate
 * (T031) — without it, the cheapest invocations would be the only invisible ones. Cache lookups
 * filter on `available`, so a marker can never satisfy one.
 */
export type AnalysisStatus =
  | 'available'
  | 'cached'
  | 'refused'
  | 'unavailable'
  | 'invalid_output';

export type AnalysisTerminalReason =
  | 'ok'
  | 'not_configured'
  | 'disabled'
  | 'budget_exhausted'
  | 'rate_limited'
  | 'timeout'
  | 'transport'
  | 'auth_failed'
  | 'provider_4xx'
  | 'provider_5xx'
  | 'provider_rate_limited'
  | 'schema_invalid';
