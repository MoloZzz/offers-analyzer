import { AnalysisPolicy } from '../analysis-policy';
import { AnalysisRequestContext, AnalysisTerminalReason } from '../analysis.types';

/**
 * SPEC-017 T018 — the advisory-analysis provider port (FR-012, Constitution IV).
 *
 * The adapter returns the model's **raw** structured payload and nothing more. Validation is the
 * caller's job and happens once, at the boundary, in `analysis-output.ts`: an adapter that also
 * validated would give each vendor its own idea of what a valid answer is, which is exactly how a
 * "mostly fine" payload eventually reaches an operator.
 *
 * Vendor selection is an operator/deployment gate, not spec content — the adapter is written against
 * this port, never the other way round.
 */
export const ANALYSIS_PROVIDER = Symbol('ANALYSIS_PROVIDER');

export interface AnalysisProviderRequest {
  context: AnalysisRequestContext;
  policy: AnalysisPolicy;
}

export type AnalysisProviderOutcome =
  | {
      status: 'available';
      /** Unvalidated structured payload exactly as the provider returned it. */
      payload: unknown;
      modelId: string;
      /** What the provider was actually asked for, safe to persist (no credentials). */
      samplingParams: Record<string, unknown>;
    }
  | {
      status: 'unavailable';
      reason: AnalysisTerminalReason;
      modelId: string;
      samplingParams: Record<string, unknown>;
      /** True when the provider may have billed for the attempt despite the failure. */
      possiblyCharged: boolean;
    };

export interface AnalysisProvider {
  readonly key: string;
  readonly adapterVersion: string;
  /** The model this adapter will call, recorded per attempt and part of the cache key. */
  readonly modelId: string;
  /** False when credentials or the feature flag are absent; the caller must not spend budget. */
  isConfigured(): boolean;
  analyze(request: AnalysisProviderRequest): Promise<AnalysisProviderOutcome>;
}
