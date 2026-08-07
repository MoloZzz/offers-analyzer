import { AnalysisStatus, AnalysisTerminalReason } from './analysis.types';
import { AiAnalysis } from './entities/ai-analysis.entity';

/**
 * SPEC-017 T031 — the read-only audit digest behind `/ai_audit` (US17.5).
 *
 * Pure and aggregate-only: it counts records, it never reads a provider and never renders stored
 * model text. A Telegram audit line is the wrong place for an answer that was written for one
 * listing — `/analyze_ai` is where that belongs.
 *
 * **Where the cache-hit rate comes from.** Phase 4 originally wrote no record for a cache hit, which
 * left this number without a source. It is computed here from `status: 'cached'` marker rows, which
 * the service now writes on every hit — see the note in `analysis.service.ts`. The rate is
 * `cached / (cached + provider attempts)`: what fraction of what the operator asked for was served
 * without spending anything.
 */
export interface AiAnalysisAuditRecord {
  status: AnalysisStatus;
  terminalReason: AnalysisTerminalReason;
  modelId: string;
  promptVersion: string;
  actorId?: string | null;
  capturedAt: Date;
}

export interface AiAnalysisAuditBudget {
  allocation: number;
  used: number;
}

export interface AiAnalysisAuditDigest {
  hasData: boolean;
  windowDays: number;
  total: number;
  /** Invocations that reached the provider: success + failure + discarded output. */
  providerAttempts: number;
  cacheHits: number;
  /** `cacheHits / (cacheHits + providerAttempts)`, or `null` when nothing was invoked. */
  cacheHitRate: number | null;
  /** Refusals never reached the provider — a disabled feature, an exhausted cap, a rate limit. */
  refusals: number;
  statusCounts: Record<string, number>;
  reasonCounts: Record<string, number>;
  modelCounts: Record<string, number>;
  promptVersionCounts: Record<string, number>;
  actorCounts: Record<string, number>;
  budget: AiAnalysisAuditBudget | null;
  lastCapturedAt: Date | null;
}

export function buildAiAnalysisAudit(
  records: readonly AiAnalysisAuditRecord[],
  options: { windowDays: number; budget?: AiAnalysisAuditBudget | null } = { windowDays: 30 },
): AiAnalysisAuditDigest {
  const statusCounts = countBy(records, (r) => r.status);
  const providerAttempts =
    (statusCounts.available ?? 0) + (statusCounts.unavailable ?? 0) + (statusCounts.invalid_output ?? 0);
  const cacheHits = statusCounts.cached ?? 0;
  const invocations = providerAttempts + cacheHits;

  return {
    hasData: records.length > 0,
    windowDays: options.windowDays,
    total: records.length,
    providerAttempts,
    cacheHits,
    cacheHitRate: invocations > 0 ? cacheHits / invocations : null,
    refusals: statusCounts.refused ?? 0,
    statusCounts,
    reasonCounts: countBy(records, (r) => r.terminalReason),
    modelCounts: countBy(records, (r) => r.modelId),
    promptVersionCounts: countBy(records, (r) => r.promptVersion),
    actorCounts: countBy(records, (r) => r.actorId ?? 'unknown'),
    budget: options.budget ?? null,
    lastCapturedAt: records.reduce<Date | null>(
      (latest, r) => (latest === null || r.capturedAt > latest ? r.capturedAt : latest),
      null,
    ),
  };
}

/** Project a persisted row onto the audit's read model — deliberately dropping `output`. */
export function toAuditRecord(row: AiAnalysis): AiAnalysisAuditRecord {
  return {
    status: row.status,
    terminalReason: row.terminalReason,
    modelId: row.modelId,
    promptVersion: row.promptVersion,
    actorId: row.actorId ?? null,
    capturedAt: row.capturedAt,
  };
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}
