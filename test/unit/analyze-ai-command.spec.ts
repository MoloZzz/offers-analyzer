/**
 * SPEC-017 T017/T024 — the `/analyze_ai` surface (US17.2 AS-1, AS-3, AS-5, FR-010, FR-011).
 *
 * Two things are being defended here. The admin gate, which must refuse *before* anything is
 * assembled or spent — a gate that refuses after the provider call would be no gate at all. And the
 * presentation rules from ADR-0019 §8: the model's number is the last thing the operator reads, in
 * its own section, saying what it is not. That ordering is a requirement, so it is asserted by
 * position rather than by eye.
 */
import { Context } from 'telegraf';

import { AnalysisService } from '../../src/modules/analysis/analysis.service';
import { formatAiAnalysis } from '../../src/modules/notifications/format/ai-analysis-message';
import { TelegramBotUpdate } from '../../src/modules/notifications/telegram/telegram-bot.update';

const URL = 'https://auto.ria.com/uk/auto_vw_passat_40143820.html';

const output = {
  warnings: [
    { code: 'dsg_mechatronics', severity: 'high' as const, rationale: 'Типова відмова.', estimatedCostUsd: 900 },
  ],
  inspectionChecklist: ['Перевірити DSG на холодну'],
  sellerQuestions: ['Коли міняли мехатронік?'],
  advisoryScore: 6,
  advisoryScoreRationale: 'Ціна відповідає ризику.',
  reliabilityNotes: ['DQ250 — відомі проблеми мехатроніка.'],
};

function buildBot(analyzeResult: unknown, adminIds: string[] = ['77']) {
  const analyze = jest.fn().mockResolvedValue(analyzeResult);
  const audit = jest.fn().mockResolvedValue({
    hasData: true,
    windowDays: 30,
    total: 2,
    providerAttempts: 1,
    cacheHits: 1,
    cacheHitRate: 0.5,
    refusals: 0,
    statusCounts: { available: 1, cached: 1 },
    reasonCounts: { ok: 2 },
    modelCounts: { 'claude-opus-5': 2 },
    promptVersionCounts: { 'analysis-v1': 2 },
    actorCounts: { '77': 2 },
    budget: { allocation: 25, used: 1 },
    lastCapturedAt: new Date('2026-08-06T10:00:00Z'),
  });
  const update = new TelegramBotUpdate(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { get: () => adminIds } as never,
    { analyze, audit } as unknown as AnalysisService,
  );
  const reply = jest.fn().mockResolvedValue(undefined);
  const ctx = {
    chat: { id: 77 },
    message: { text: `/analyze_ai ${URL}` },
    reply,
  } as unknown as Context;
  return { update, ctx, reply, analyze, audit };
}

/** A callback-query context, as the inline button under an alert delivers it. */
function buttonCtx(listingId: string, chatId = 77) {
  const reply = jest.fn().mockResolvedValue(undefined);
  const answerCbQuery = jest.fn().mockResolvedValue(undefined);
  return {
    ctx: {
      chat: { id: chatId },
      callbackQuery: { data: `ai:${listingId}` },
      reply,
      answerCbQuery,
    } as unknown as Context,
    reply,
    answerCbQuery,
  };
}

const replied = (reply: jest.Mock): string => reply.mock.calls.map((c) => c[0]).join('\n');

describe('/analyze_ai — admin gate (AS-3)', () => {
  it('refuses a non-admin without making any provider request', async () => {
    const { update, ctx, reply, analyze } = buildBot(null, ['999']);

    await update.onAnalyzeAi(ctx);

    expect(analyze).not.toHaveBeenCalled();
    expect(replied(reply)).toContain('administrators only');
  });

  it('asks for a link when the admin sends none, without calling the service', async () => {
    const { update, ctx, reply, analyze } = buildBot(null);
    (ctx as unknown as { message: { text: string } }).message.text = '/analyze_ai';

    await update.onAnalyzeAi(ctx);

    expect(analyze).not.toHaveBeenCalled();
    expect(replied(reply)).toContain('/analyze_ai');
  });

  it('passes the admin chat id as the actor, so the attempt is attributable (FR-001)', async () => {
    const { update, ctx, analyze } = buildBot({ status: 'refused', reason: 'disabled', record: null });

    await update.onAnalyzeAi(ctx);

    expect(analyze).toHaveBeenCalledWith({ externalId: '40143820', actorId: '77' });
  });
});

describe('/analyze_ai — refusals name what stopped them (US17.4)', () => {
  it('names the monthly cap and its reset, and says discovery is unaffected', async () => {
    const { update, ctx, reply } = buildBot({
      status: 'refused',
      reason: 'budget_exhausted',
      record: {},
      admission: { admitted: false, reason: 'operation_allocation_exhausted', allocation: 25, resetsAt: new Date('2026-09-01') },
    });

    await update.onAnalyzeAi(ctx);
    const text = replied(reply);

    expect(text).toContain('25');
    expect(text).toContain('AUTO.RIA');
  });

  it('names the per-admin limit', async () => {
    const { update, ctx, reply } = buildBot({
      status: 'refused',
      reason: 'rate_limited',
      record: {},
      admission: { admitted: false, reason: 'per_admin_rate_limited', perAdminLimit: 3, perAdminWindowHours: 24 },
    });

    await update.onAnalyzeAi(ctx);

    expect(replied(reply)).toContain('3 за 24');
  });

  it('shows nothing from a failed attempt and says the evaluation is unchanged (AS-4)', async () => {
    const { update, ctx, reply } = buildBot({
      status: 'failed',
      reason: 'schema_invalid',
      record: {},
      listing: {},
    });

    await update.onAnalyzeAi(ctx);
    const text = replied(reply);

    expect(text).toContain('не вдався');
    expect(text).not.toContain('mechatronics');
  });
});

describe('/analyze_ai — a cache hit is shown as one (US17.3 AS-2)', () => {
  const record = {
    modelId: 'claude-opus-5',
    promptVersion: 'analysis-v1',
    capturedAt: new Date('2026-07-02T09:00:00Z'),
    output,
  };

  it('renders the stored answer marked as cached, with its original capture time', async () => {
    const { update, ctx, reply } = buildBot({
      status: 'cached',
      record,
      listing: { make: 'Volkswagen', model: 'Passat', year: 2017, url: URL },
    });

    await update.onAnalyzeAi(ctx);
    const text = replied(reply);

    expect(text).toContain('Збережена відповідь');
    expect(text).toContain('без нового запиту');
    // Content is the stored answer, unchanged.
    expect(text).toContain('dsg_mechatronics');
  });

  it('renders a fresh answer without the cached marker', async () => {
    const { update, ctx, reply } = buildBot({
      status: 'available',
      record,
      listing: { make: 'Volkswagen', model: 'Passat', year: 2017, url: URL },
    });

    await update.onAnalyzeAi(ctx);

    expect(replied(reply)).not.toContain('Збережена відповідь');
  });
});

describe('SPEC-017 rendering — the advisory score is subordinate (FR-010, ADR-0019 §8)', () => {
  const rendered = formatAiAnalysis({
    make: 'Volkswagen',
    model: 'Passat',
    year: 2017,
    url: URL,
    modelId: 'claude-opus-5',
    promptVersion: 'analysis-v1',
    capturedAt: new Date('2026-08-06T10:00:00Z'),
    output,
  });

  it('puts warnings, checklist and questions before the advisory score', () => {
    const scoreAt = rendered.indexOf('оцінка моделі');

    expect(scoreAt).toBeGreaterThan(rendered.indexOf('Ризики'));
    expect(scoreAt).toBeGreaterThan(rendered.indexOf('перевірити на огляді'));
    expect(scoreAt).toBeGreaterThan(rendered.indexOf('запитати в продавця'));
  });

  it('states that the score is not the deal score and changes nothing', () => {
    expect(rendered).toContain('не «Бал угоди»');
    expect(rendered).toContain('не впливає на бал');
  });

  it('renders on the 0–10 scale, so it cannot be read as a 0–100 deal score (glossary)', () => {
    expect(rendered).toContain('6 з 10');
    expect(rendered).not.toContain('100');
  });

  it('labels reliability claims model-generated and unverified (FR-011)', () => {
    const notesAt = rendered.indexOf('DQ250');

    expect(notesAt).toBeGreaterThan(-1);
    expect(rendered.slice(0, notesAt)).toContain('не перевірені');
  });

  it('marks a cached answer with its original capture time (FR-005 rendering contract)', () => {
    const cached = formatAiAnalysis({
      make: 'Volkswagen',
      model: 'Passat',
      year: 2017,
      url: URL,
      modelId: 'claude-opus-5',
      promptVersion: 'analysis-v1',
      capturedAt: new Date('2026-08-01T10:00:00Z'),
      output,
      cached: true,
    });

    expect(cached).toContain('Збережена відповідь');
    expect(cached).toContain('без нового запиту');
  });
});

describe('/ai_audit — admin-only accounting surface (T031)', () => {
  it('refuses a non-admin without reading anything', async () => {
    const { update, ctx, reply, audit } = buildBot(null, ['999']);

    await update.onAiAudit(ctx);

    expect(audit).not.toHaveBeenCalled();
    expect(replied(reply)).toContain('administrators only');
  });

  it('defaults to a 30-day window and renders the digest', async () => {
    const { update, ctx, reply, audit } = buildBot(null);
    (ctx as unknown as { message: { text: string } }).message.text = '/ai_audit';

    await update.onAiAudit(ctx);

    expect(audit).toHaveBeenCalledWith(30);
    expect(replied(reply)).toContain('Влучань у кеш: 50%');
  });

  it('accepts a window argument, clamped to a year', async () => {
    const { update, ctx, audit } = buildBot(null);
    (ctx as unknown as { message: { text: string } }).message.text = '/ai_audit 9999';

    await update.onAiAudit(ctx);

    expect(audit).toHaveBeenCalledWith(365);
  });
});

describe('🤖 AI-аналіз button — the same path, gated again (T032)', () => {
  it('routes an admin tap to the analysis service by listing id', async () => {
    const { update, analyze } = buildBot({ status: 'refused', reason: 'disabled', record: null });
    const { ctx, answerCbQuery } = buttonCtx('listing-1');

    await update.onAnalyzeButton(ctx);

    expect(analyze).toHaveBeenCalledWith({ listingId: 'listing-1', actorId: '77' });
    expect(answerCbQuery).toHaveBeenCalled();
  });

  it('refuses a non-admin tap without calling the service', async () => {
    const { update, analyze } = buildBot(null, ['999']);
    const { ctx, answerCbQuery, reply } = buttonCtx('listing-1');

    await update.onAnalyzeButton(ctx);

    expect(analyze).not.toHaveBeenCalled();
    expect(answerCbQuery).toHaveBeenCalledWith('Тільки для адміністраторів');
    expect(reply).not.toHaveBeenCalled();
  });

  it('ignores a malformed callback', async () => {
    const { update, analyze } = buildBot(null);
    const { ctx } = buttonCtx('listing-1');
    (ctx as unknown as { callbackQuery: { data: string } }).callbackQuery.data = 'details:listing-1';

    await update.onAnalyzeButton(ctx);

    expect(analyze).not.toHaveBeenCalled();
  });
});
