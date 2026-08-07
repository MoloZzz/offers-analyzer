/**
 * SPEC-017 T030 — a stored analysis stands on its own (US17.5, SC-005, SC-006, FR-009).
 *
 * The claim: an answer produced last month renders in full **today**, with the provider disabled,
 * its credentials gone, and no network reachable. That is what makes a non-reproducible output
 * auditable after the fact — and it is the same contract `/why` has with SPEC-015 evidence.
 *
 * The provider double here does not return a failure; it **throws**. A test that let the provider
 * be politely unavailable would still pass if the code quietly called it, which is the one outcome
 * this test exists to rule out.
 */
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { AppConfig } from '../../src/common/config/configuration';
import { AnalysisService } from '../../src/modules/analysis/analysis.service';
import { AiAnalysis } from '../../src/modules/analysis/entities/ai-analysis.entity';
import { AnalysisProvider } from '../../src/modules/analysis/ports/analysis-provider.port';
import { Listing } from '../../src/modules/listings/entities/listing.entity';
import { formatAiAnalysis } from '../../src/modules/notifications/format/ai-analysis-message';
import { RateBudgetService } from '../../src/modules/scheduling/rate-budget.service';

const LAST_MONTH = new Date('2026-07-02T09:00:00Z');

const OUTPUT = {
  warnings: [
    { code: 'dsg_mechatronics', severity: 'high' as const, rationale: 'Типова відмова.', estimatedCostUsd: 900 },
  ],
  inspectionChecklist: ['Перевірити DSG на холодну'],
  sellerQuestions: ['Коли міняли мехатронік?'],
  advisoryScore: 6,
  advisoryScoreRationale: 'Ціна відповідає ризику.',
  reliabilityNotes: ['DQ250 — відомі проблеми.'],
};

const listing = {
  id: 'listing-1',
  externalId: '40143820',
  make: 'Volkswagen',
  model: 'Passat',
  year: 2017,
  mileage: 180,
  sellerType: 'private',
  vin: null,
  url: 'https://auto.ria.com/uk/auto_vw_passat_40143820.html',
  description: 'Один власник',
  currentAmount: 11000,
  currentCurrency: 'USD',
  lastExplanation: null,
} as unknown as Listing;

/** The service as a fresh deployment would have it: switched off, no key, nothing reachable. */
function buildOfflineHarness(storedHash: string) {
  const stored = {
    id: 'rec-stored',
    listingId: 'listing-1',
    inputFactHash: storedHash,
    promptVersion: 'analysis-v1',
    modelId: 'claude-opus-5',
    adapterVersion: 'anthropic-analysis-v1',
    samplingParams: { temperature: 0.2 },
    factSnapshot: { facts: [], untrustedText: 'Один власник' },
    output: OUTPUT,
    status: 'available',
    terminalReason: 'ok',
    actorId: '77',
    capturedAt: LAST_MONTH,
  } as unknown as AiAnalysis;

  const rows: AiAnalysis[] = [stored];
  const analyze = jest.fn(() => {
    throw new Error('the provider must not be reached');
  });
  const provider: AnalysisProvider = {
    key: 'fake',
    adapterVersion: 'anthropic-analysis-v1',
    modelId: 'claude-opus-5',
    isConfigured: () => false,
    analyze: analyze as unknown as AnalysisProvider['analyze'],
  };

  const tryConsumeAiAnalysis = jest.fn();
  const budget = {
    tryConsumeAiAnalysis,
    releaseAiAnalysis: jest.fn(),
    aiAnalysisAllocation: jest.fn().mockResolvedValue(null),
  } as unknown as RateBudgetService;

  const config = {
    get: (key: keyof AppConfig) =>
      ({
        aiAnalysisEnabled: false,
        aiAnalysisMonthlyAllocation: 0,
        aiAnalysisPerAdminLimit: 10,
        aiAnalysisPerAdminWindowHours: 24,
      })[key as string],
  } as unknown as ConfigService<AppConfig, true>;

  const update = jest.fn();
  const analyses = {
    create: (x: Partial<AiAnalysis>) =>
      ({ id: `rec-${rows.length + 1}`, capturedAt: new Date(), ...x }) as AiAnalysis,
    save: (x: AiAnalysis) => {
      rows.push(x);
      return Promise.resolve(x);
    },
    update,
    findOne: ({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        rows.find((row) =>
          Object.entries(where).every(([key, value]) => (row as never)[key] === value),
        ) ?? null,
      ),
    find: () => Promise.resolve(rows),
  } as unknown as Repository<AiAnalysis>;

  const service = new AnalysisService(
    config,
    { findOne: () => Promise.resolve(listing) } as unknown as Repository<Listing>,
    analyses,
    budget,
    provider,
    { warn: jest.fn(), error: jest.fn() } as never,
    { get: () => ({}) } as never,
  );
  return { service, rows, stored, analyze, update, tryConsumeAiAnalysis };
}

/**
 * The stored row must be keyed to the *current* facts, or the lookup would legitimately miss and
 * this test would prove nothing. So the hash is taken from a live run rather than hard-coded.
 */
async function currentHash(): Promise<string> {
  const probe = buildOfflineHarness('placeholder');
  await probe.service.analyze({ externalId: '40143820', actorId: '77' });
  const written = probe.rows[probe.rows.length - 1];
  return written.inputFactHash;
}

describe('SPEC-017 stored analysis renders with the provider disabled and no network (SC-005)', () => {
  it('serves the month-old answer without touching the provider or the budget', async () => {
    const h = buildOfflineHarness(await currentHash());

    const attempt = await h.service.analyze({ externalId: '40143820', actorId: '77' });

    expect(attempt.status).toBe('cached');
    expect(h.analyze).not.toHaveBeenCalled();
    expect(h.tryConsumeAiAnalysis).not.toHaveBeenCalled();
  });

  it('renders the full answer, marked, with its original capture time', async () => {
    const h = buildOfflineHarness(await currentHash());

    const attempt = await h.service.analyze({ externalId: '40143820', actorId: '77' });
    if (attempt.status !== 'cached') throw new Error('expected a cache hit');
    const rendered = formatAiAnalysis({
      make: attempt.listing.make,
      model: attempt.listing.model,
      year: attempt.listing.year,
      url: attempt.listing.url,
      modelId: attempt.record.modelId,
      promptVersion: attempt.record.promptVersion,
      capturedAt: attempt.record.capturedAt,
      output: OUTPUT,
      cached: true,
    });

    expect(attempt.record.capturedAt).toEqual(LAST_MONTH);
    expect(rendered).toContain('dsg_mechatronics');
    expect(rendered).toContain('Перевірити DSG на холодну');
    expect(rendered).toContain('Коли міняли мехатронік?');
    expect(rendered).toContain('6 з 10');
    expect(rendered).toContain('Збережена відповідь');
  });
});

describe('SPEC-017 stored records are never mutated (SC-006)', () => {
  it('leaves the stored row byte-identical after serving it', async () => {
    const h = buildOfflineHarness(await currentHash());
    const before = JSON.stringify(h.stored);

    await h.service.analyze({ externalId: '40143820', actorId: '77' });
    await h.service.analyze({ externalId: '40143820', actorId: '99' });

    expect(JSON.stringify(h.stored)).toBe(before);
    expect(h.update).not.toHaveBeenCalled();
  });

  it('appends a marker per hit rather than editing or copying the answer', async () => {
    const h = buildOfflineHarness(await currentHash());

    await h.service.analyze({ externalId: '40143820', actorId: '77' });
    await h.service.analyze({ externalId: '40143820', actorId: '99' });

    const added = h.rows.slice(1);
    expect(added.map((r) => r.status)).toEqual(['cached', 'cached']);
    expect(added.every((r) => !r.output)).toBe(true);
    expect(added.map((r) => r.actorId)).toEqual(['77', '99']);
  });
});
