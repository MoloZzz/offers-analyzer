/**
 * SPEC-017 T031 — `/ai_audit` (US17.5).
 *
 * The number that needed a decision is the **cache-hit rate**. Phase 4 wrote nothing for a hit,
 * which left the cheapest invocations as the only invisible ones; the service now writes a `cached`
 * marker row, and this is where that choice is cashed out. The rate is over *invocations* — hits
 * plus provider attempts — and deliberately excludes refusals: a refused tap never asked the
 * question, so counting it would deflate the rate with events the cache could never have served.
 */
import {
  AiAnalysisAuditRecord,
  buildAiAnalysisAudit,
} from '../../src/modules/analysis/ai-analysis-audit';
import { AnalysisStatus, AnalysisTerminalReason } from '../../src/modules/analysis/analysis.types';
import { formatAiAnalysisAudit } from '../../src/modules/notifications/format/ai-analysis-audit-message';

function record(
  status: AnalysisStatus,
  terminalReason: AnalysisTerminalReason = 'ok',
  overrides: Partial<AiAnalysisAuditRecord> = {},
): AiAnalysisAuditRecord {
  return {
    status,
    terminalReason,
    modelId: 'claude-opus-5',
    promptVersion: 'analysis-v1',
    actorId: '77',
    capturedAt: new Date('2026-08-05T10:00:00Z'),
    ...overrides,
  };
}

describe('SPEC-017 audit digest — the cache-hit rate', () => {
  it('is hits over invocations, counting provider attempts and hits alike', () => {
    const digest = buildAiAnalysisAudit(
      [record('available'), record('cached'), record('cached'), record('cached')],
      { windowDays: 30 },
    );

    expect(digest.providerAttempts).toBe(1);
    expect(digest.cacheHits).toBe(3);
    expect(digest.cacheHitRate).toBe(0.75);
  });

  it('counts a failed and a discarded attempt as provider attempts — they cost money', () => {
    const digest = buildAiAnalysisAudit(
      [record('unavailable', 'timeout'), record('invalid_output', 'schema_invalid'), record('cached')],
      { windowDays: 30 },
    );

    expect(digest.providerAttempts).toBe(2);
    expect(digest.cacheHitRate).toBeCloseTo(1 / 3);
  });

  it('excludes refusals from the rate — a refused tap never asked the provider anything', () => {
    const digest = buildAiAnalysisAudit(
      [record('available'), record('cached'), record('refused', 'disabled'), record('refused', 'budget_exhausted')],
      { windowDays: 30 },
    );

    expect(digest.refusals).toBe(2);
    expect(digest.cacheHitRate).toBe(0.5);
  });

  it('reports no rate rather than a zero when nothing was invoked', () => {
    const digest = buildAiAnalysisAudit([record('refused', 'disabled')], { windowDays: 30 });

    expect(digest.cacheHitRate).toBeNull();
  });
});

describe('SPEC-017 audit digest — what it counts and what it refuses to carry', () => {
  it('breaks attempts down by status, reason, model, prompt version and admin', () => {
    const digest = buildAiAnalysisAudit(
      [
        record('available'),
        record('unavailable', 'timeout', { actorId: '99' }),
        record('available', 'ok', { modelId: 'claude-opus-6', promptVersion: 'analysis-v2' }),
      ],
      { windowDays: 7 },
    );

    expect(digest.statusCounts).toEqual({ available: 2, unavailable: 1 });
    expect(digest.reasonCounts).toEqual({ ok: 2, timeout: 1 });
    expect(digest.modelCounts).toEqual({ 'claude-opus-5': 2, 'claude-opus-6': 1 });
    expect(digest.promptVersionCounts).toEqual({ 'analysis-v1': 2, 'analysis-v2': 1 });
    expect(digest.actorCounts).toEqual({ '77': 2, '99': 1 });
    expect(digest.windowDays).toBe(7);
  });

  it('carries the dedicated allocation, never the AUTO.RIA pool', () => {
    const digest = buildAiAnalysisAudit([record('available')], {
      windowDays: 30,
      budget: { allocation: 25, used: 4 },
    });

    expect(digest.budget).toEqual({ allocation: 25, used: 4 });
  });

  it('reports the newest capture time', () => {
    const digest = buildAiAnalysisAudit(
      [
        record('available', 'ok', { capturedAt: new Date('2026-08-01T10:00:00Z') }),
        record('cached', 'ok', { capturedAt: new Date('2026-08-06T10:00:00Z') }),
      ],
      { windowDays: 30 },
    );

    expect(digest.lastCapturedAt).toEqual(new Date('2026-08-06T10:00:00Z'));
  });

  it('says so plainly when there is nothing to report', () => {
    const digest = buildAiAnalysisAudit([], { windowDays: 30 });

    expect(digest.hasData).toBe(false);
    expect(formatAiAnalysisAudit(digest)).toContain('вимкнена за замовчуванням');
  });
});

describe('SPEC-017 audit rendering', () => {
  const digest = buildAiAnalysisAudit(
    [record('available'), record('cached'), record('refused', 'budget_exhausted')],
    { windowDays: 30, budget: { allocation: 25, used: 1 } },
  );
  const rendered = formatAiAnalysisAudit(digest);

  it('shows the hit rate, the counts, and the separate allocation', () => {
    expect(rendered).toContain('50%');
    expect(rendered).toContain('з кешу: 1');
    expect(rendered).toContain('1/25');
    expect(rendered).toContain('не з пулу AUTO.RIA');
  });

  it('states that records are immutable and change no scoring', () => {
    expect(rendered).toContain('незмінні');
    expect(rendered).toContain('не впливає на бал');
  });

  it('carries no stored model text — an audit is accounting, not a second reading surface', () => {
    expect(rendered).not.toContain('dsg');
    expect(rendered).not.toContain('Причина');
  });
});
