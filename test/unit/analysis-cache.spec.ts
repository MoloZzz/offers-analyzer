/**
 * SPEC-017 T026/T029 — the content-hash cache (US17.3, FR-005, SC-004).
 *
 * The operator asked for this explicitly, and the reason is economic: without it, cost tracks taps
 * rather than decisions. So the assertions are about *requests and charges*, not about convenience —
 * a hit must make zero provider calls, consume zero allocation, and still say when the answer it is
 * showing was actually produced.
 *
 * The invalidation cases are the other half. `inputFactHash` covers price, description, and every
 * source fact, so a changed listing simply misses; there is no explicit invalidation path to get
 * wrong. A prompt-version or model change must miss for the same reason — the answer would have
 * been produced under different rules.
 */
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { AppConfig } from '../../src/common/config/configuration';
import { AnalysisService } from '../../src/modules/analysis/analysis.service';
import { AiAnalysis } from '../../src/modules/analysis/entities/ai-analysis.entity';
import { AnalysisProvider, AnalysisProviderOutcome } from '../../src/modules/analysis/ports/analysis-provider.port';
import { Listing } from '../../src/modules/listings/entities/listing.entity';
import { RateBudgetService } from '../../src/modules/scheduling/rate-budget.service';

const VALID_PAYLOAD = {
  warnings: [{ code: 'dsg_mechatronics', severity: 'high', rationale: 'Типова відмова.' }],
  inspectionChecklist: ['Перевірити DSG на холодну'],
  sellerQuestions: ['Коли міняли мехатронік?'],
  advisoryScore: 6,
  advisoryScoreRationale: 'Ціна відповідає ризику.',
  reliabilityNotes: [],
};

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
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
    ...overrides,
  } as unknown as Listing;
}

/**
 * A harness whose repositories are shared across calls, so the second `analyze()` sees what the
 * first one persisted — which is the entire point of a cache test.
 */
function buildHarness(options: { modelId?: string; outcome?: AnalysisProviderOutcome } = {}) {
  const rows: AiAnalysis[] = [];
  let listing = makeListing();
  let resolveNext: ((value: AnalysisProviderOutcome) => void) | null = null;

  const analyze = jest.fn(
    (): Promise<AnalysisProviderOutcome> =>
      options.outcome
        ? Promise.resolve(options.outcome)
        : Promise.resolve({
            status: 'available',
            payload: VALID_PAYLOAD,
            modelId: options.modelId ?? 'claude-opus-5',
            samplingParams: { temperature: 0.2 },
          }),
  );
  const provider: AnalysisProvider = {
    key: 'fake',
    adapterVersion: 'fake-v1',
    modelId: options.modelId ?? 'claude-opus-5',
    isConfigured: () => true,
    analyze,
  };

  const tryConsumeAiAnalysis = jest.fn().mockResolvedValue({ admitted: true, reason: 'allowed' });
  const budget = {
    tryConsumeAiAnalysis,
    releaseAiAnalysis: jest.fn().mockResolvedValue(undefined),
  } as unknown as RateBudgetService;

  const config = {
    get: (key: keyof AppConfig) =>
      ({
        aiAnalysisEnabled: true,
        aiAnalysisMonthlyAllocation: 10,
        aiAnalysisPerAdminLimit: 10,
        aiAnalysisPerAdminWindowHours: 24,
      })[key as string],
  } as unknown as ConfigService<AppConfig, true>;

  const listings = {
    findOne: () => Promise.resolve(listing),
  } as unknown as Repository<Listing>;

  const analyses = {
    create: (x: Partial<AiAnalysis>) =>
      ({ id: `rec-${rows.length + 1}`, capturedAt: new Date(Date.now() + rows.length), ...x }) as AiAnalysis,
    save: (x: AiAnalysis) => {
      rows.push(x);
      return Promise.resolve(x);
    },
    findOne: ({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        [...rows]
          .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())
          .find((row) =>
            Object.entries(where).every(([key, value]) => (row as never)[key] === value),
          ) ?? null,
      ),
  } as unknown as Repository<AiAnalysis>;

  const service = new AnalysisService(config, listings, analyses, budget, provider, {
    warn: jest.fn(),
    error: jest.fn(),
  } as never);

  return {
    service,
    rows,
    analyze,
    tryConsumeAiAnalysis,
    run: (actorId = '77') => service.analyze({ externalId: '40143820', actorId }),
    mutateListing: (patch: Partial<Listing>) => {
      listing = makeListing(patch);
    },
    holdProvider: () => {
      analyze.mockImplementation(
        () =>
          new Promise<AnalysisProviderOutcome>((resolve) => {
            resolveNext = resolve;
          }),
      );
    },
    /**
     * Drain until the first call is actually *inside* the held provider. A fixed number of ticks
     * would be a guess — `analyze()` sits behind the listing lookup, the cache lookup and budget
     * admission, and the count of awaits before it is not this test's business to know.
     */
    providerReached: async () => {
      for (let i = 0; i < 200 && analyze.mock.calls.length === 0; i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      if (analyze.mock.calls.length === 0) throw new Error('provider was never reached');
    },
    /** Let a pending call run as far as it can without resolving the provider. */
    settle: async () => {
      for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
    },
    releaseProvider: () =>
      resolveNext?.({
        status: 'available',
        payload: VALID_PAYLOAD,
        modelId: options.modelId ?? 'claude-opus-5',
        samplingParams: {},
      }),
  };
}

describe('SPEC-017 cache — a repeat request costs nothing (SC-004, AS-1)', () => {
  it('makes one provider request for two calls on an unchanged listing', async () => {
    const h = buildHarness();

    const first = await h.run();
    const second = await h.run();

    expect(first.status).toBe('available');
    expect(second.status).toBe('cached');
    expect(h.analyze).toHaveBeenCalledTimes(1);
  });

  it('charges no budget on a hit — admission is never even attempted', async () => {
    const h = buildHarness();

    await h.run();
    await h.run();

    expect(h.tryConsumeAiAnalysis).toHaveBeenCalledTimes(1);
  });

  it('serves the identical stored answer, with its original capture time', async () => {
    const h = buildHarness();

    const first = await h.run();
    const second = await h.run();

    if (first.status !== 'available' || second.status !== 'cached') throw new Error('unexpected');
    expect(second.record.output).toEqual(first.record.output);
    expect(second.record.capturedAt).toEqual(first.record.capturedAt);
  });

  it('writes no second row — the served record is the record of that analysis (SC-006)', async () => {
    const h = buildHarness();

    await h.run();
    await h.run();
    await h.run();

    expect(h.rows).toHaveLength(1);
  });

  it('serves a different admin from the same cache', async () => {
    const h = buildHarness();

    await h.run('77');
    const other = await h.run('99');

    expect(other.status).toBe('cached');
    expect(h.analyze).toHaveBeenCalledTimes(1);
  });
});

describe('SPEC-017 cache — a changed listing misses (AS-3)', () => {
  it.each([
    ['price drop', { currentAmount: 10200 } as Partial<Listing>],
    ['edited description', { description: 'Терміново, є нюанси' } as Partial<Listing>],
    ['changed mileage', { mileage: 195 } as Partial<Listing>],
  ])('makes a fresh provider request after a recorded %s', async (_label, patch) => {
    const h = buildHarness();

    await h.run();
    h.mutateListing(patch);
    const second = await h.run();

    expect(second.status).toBe('available');
    expect(h.analyze).toHaveBeenCalledTimes(2);
    expect(h.rows).toHaveLength(2);
  });
});

describe('SPEC-017 cache — the key includes the rules the answer was produced under (AS-4)', () => {
  it('does not satisfy a new model id from an old entry', async () => {
    const first = buildHarness({ modelId: 'claude-opus-5' });
    await first.run();

    // Same listing, same facts, different model: the stored row carries the old model id, so the
    // lookup on the composite key cannot match it.
    const stored = first.rows[0];
    expect(stored.modelId).toBe('claude-opus-5');

    const upgraded = buildHarness({ modelId: 'claude-opus-6' });
    upgraded.rows.push(stored);
    const attempt = await upgraded.run();

    expect(attempt.status).toBe('available');
    expect(upgraded.analyze).toHaveBeenCalledTimes(1);
  });

  it('does not satisfy a new prompt version from an old entry', async () => {
    const h = buildHarness();
    await h.run();
    // Simulate the prompt being versioned forward: the stored row is now keyed to a past version.
    h.rows[0].promptVersion = 'analysis-v0';

    const attempt = await h.run();

    expect(attempt.status).toBe('available');
    expect(h.analyze).toHaveBeenCalledTimes(2);
  });

  it('never serves a failed attempt from cache — a transient fault is not a verdict', async () => {
    const h = buildHarness({
      outcome: {
        status: 'unavailable',
        reason: 'timeout',
        modelId: 'claude-opus-5',
        samplingParams: {},
        possiblyCharged: true,
      },
    });

    const first = await h.run();
    const second = await h.run();

    expect(first.status).toBe('failed');
    expect(second.status).toBe('failed');
    expect(h.analyze).toHaveBeenCalledTimes(2);
  });
});

describe('SPEC-017 cache — concurrent taps single-flight (T029)', () => {
  it('produces one provider request when two admins ask at the same moment', async () => {
    const h = buildHarness();
    h.holdProvider();

    const first = h.run('77');
    await h.providerReached();
    // The second admin taps while the first request is still open at the provider.
    const second = h.run('99');
    await h.settle();
    h.releaseProvider();
    const [a, b] = await Promise.all([first, second]);

    expect(h.analyze).toHaveBeenCalledTimes(1);
    expect(h.tryConsumeAiAnalysis).toHaveBeenCalledTimes(1);
    expect(a.status).toBe('available');
    expect(b.status).toBe('cached');
    expect(h.rows).toHaveLength(1);
  });

  it('releases the key afterwards, so a later request is served from the stored cache', async () => {
    const h = buildHarness();
    h.holdProvider();

    const first = h.run('77');
    await h.providerReached();
    h.releaseProvider();
    await first;

    const later = await h.run('77');

    expect(later.status).toBe('cached');
    expect(h.analyze).toHaveBeenCalledTimes(1);
  });
});
