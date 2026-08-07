/**
 * SPEC-017 T016 — one attempt, one record, nothing partial (US17.2 AS-2, FR-004, FR-008, SC-006).
 *
 * The service is exercised with a fake provider so every terminal path is reachable: a valid
 * payload, a schema-violating one, a provider outage, a disabled feature, an exhausted cap. Each
 * case asserts the same two things — what the operator gets back, and that exactly one immutable
 * row was written describing it.
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

function buildHarness(options: {
  outcome?: AnalysisProviderOutcome;
  admitted?: boolean;
  enabled?: boolean;
  configured?: boolean;
  listingFound?: boolean;
}) {
  const rows: AiAnalysis[] = [];
  const analyze = jest.fn().mockResolvedValue(
    options.outcome ?? {
      status: 'available',
      payload: VALID_PAYLOAD,
      modelId: 'claude-opus-5',
      samplingParams: { temperature: 0.2 },
    },
  );
  const provider: AnalysisProvider = {
    key: 'fake',
    adapterVersion: 'fake-v1',
    modelId: 'claude-opus-5',
    isConfigured: () => options.configured ?? true,
    analyze,
  };
  const release = jest.fn().mockResolvedValue(undefined);
  const tryConsumeAiAnalysis = jest.fn().mockResolvedValue(
    options.admitted === false
      ? { admitted: false, reason: 'operation_allocation_exhausted', allocation: 0 }
      : { admitted: true, reason: 'allowed' },
  );
  const budget = { tryConsumeAiAnalysis, releaseAiAnalysis: release } as unknown as RateBudgetService;

  const config = {
    get: (key: keyof AppConfig) =>
      ({
        aiAnalysisEnabled: options.enabled ?? true,
        aiAnalysisMonthlyAllocation: 10,
        aiAnalysisPerAdminLimit: 10,
        aiAnalysisPerAdminWindowHours: 24,
      })[key as string],
  } as unknown as ConfigService<AppConfig, true>;

  const listings = {
    findOne: () => Promise.resolve(options.listingFound === false ? null : listing),
  } as unknown as Repository<Listing>;
  const analyses = {
    create: (x: Partial<AiAnalysis>) => ({ id: `rec-${rows.length + 1}`, capturedAt: new Date(), ...x }) as AiAnalysis,
    save: (x: AiAnalysis) => {
      rows.push(x);
      return Promise.resolve(x);
    },
    // Every case in this file is a cache miss by construction; the cache itself is
    // `analysis-cache.spec.ts`'s subject.
    findOne: () => Promise.resolve(null),
  } as unknown as Repository<AiAnalysis>;

  const service = new AnalysisService(config, listings, analyses, budget, provider, {
    warn: jest.fn(),
    error: jest.fn(),
  } as never);
  return { service, rows, analyze, tryConsumeAiAnalysis, release };
}

const run = (h: ReturnType<typeof buildHarness>) =>
  h.service.analyze({ externalId: '40143820', actorId: '77' });

describe('SPEC-017 AnalysisService — the happy path', () => {
  it('validates, persists, and returns the model answer', async () => {
    const harness = buildHarness({});

    const attempt = await run(harness);

    expect(attempt.status).toBe('available');
    expect(harness.rows).toHaveLength(1);
    expect(harness.rows[0]).toMatchObject({
      listingId: 'listing-1',
      status: 'available',
      terminalReason: 'ok',
      modelId: 'claude-opus-5',
      promptVersion: 'analysis-v1',
      actorId: '77',
    });
    expect(harness.rows[0].output?.advisoryScore).toBe(6);
  });

  it('persists the exact facts and quoted text the answer was produced from (FR-008)', async () => {
    const harness = buildHarness({});

    await run(harness);

    expect(harness.rows[0].factSnapshot.untrustedText).toBe('Один власник');
    expect(harness.rows[0].factSnapshot.facts.some((f) => f.key === 'asking_price')).toBe(true);
    expect(harness.rows[0].inputFactHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('SPEC-017 AnalysisService — schema-invalid output (AS-2, FR-004)', () => {
  const invalid = {
    status: 'available' as const,
    payload: { ...VALID_PAYLOAD, advisoryScore: 62 },
    modelId: 'claude-opus-5',
    samplingParams: {},
  };

  it('renders nothing from it and persists a failed attempt', async () => {
    const harness = buildHarness({ outcome: invalid });

    const attempt = await run(harness);

    expect(attempt.status).toBe('failed');
    expect(harness.rows).toHaveLength(1);
    expect(harness.rows[0].status).toBe('invalid_output');
    expect(harness.rows[0].output).toBeUndefined();
    expect(harness.rows[0].violation).toBeTruthy();
  });

  it('does not return the allocation — the provider call was made and billed', async () => {
    const harness = buildHarness({ outcome: invalid });

    await run(harness);

    expect(harness.release).not.toHaveBeenCalled();
  });
});

describe('SPEC-017 AnalysisService — provider failure and refusals', () => {
  it('records a provider outage and returns the allocation when nothing can have been billed', async () => {
    const harness = buildHarness({
      outcome: {
        status: 'unavailable',
        reason: 'auth_failed',
        modelId: 'claude-opus-5',
        samplingParams: {},
        possiblyCharged: false,
      },
    });

    const attempt = await run(harness);

    expect(attempt.status).toBe('failed');
    expect(harness.rows[0]).toMatchObject({ status: 'unavailable', terminalReason: 'auth_failed' });
    expect(harness.release).toHaveBeenCalled();
  });

  it('keeps the charge when the provider may have billed despite failing', async () => {
    const harness = buildHarness({
      outcome: {
        status: 'unavailable',
        reason: 'timeout',
        modelId: 'claude-opus-5',
        samplingParams: {},
        possiblyCharged: true,
      },
    });

    await run(harness);

    expect(harness.release).not.toHaveBeenCalled();
  });

  it('refuses without calling the provider when the feature is disabled (FR-007)', async () => {
    const harness = buildHarness({ enabled: false });

    const attempt = await run(harness);

    expect(attempt.status).toBe('refused');
    expect(harness.analyze).not.toHaveBeenCalled();
    expect(harness.tryConsumeAiAnalysis).not.toHaveBeenCalled();
    expect(harness.rows[0]).toMatchObject({ status: 'refused', terminalReason: 'disabled' });
  });

  it('distinguishes an unconfigured provider from a disabled feature', async () => {
    const harness = buildHarness({ configured: false });

    await run(harness);

    expect(harness.rows[0].terminalReason).toBe('not_configured');
  });

  it('refuses without calling the provider when the budget denies admission (AS-1)', async () => {
    const harness = buildHarness({ admitted: false });

    const attempt = await run(harness);

    expect(attempt.status).toBe('refused');
    expect(harness.analyze).not.toHaveBeenCalled();
    expect(harness.rows[0].terminalReason).toBe('budget_exhausted');
  });

  it('reports a missing listing without persisting or spending anything', async () => {
    const harness = buildHarness({ listingFound: false });

    const attempt = await run(harness);

    expect(attempt.status).toBe('listing_missing');
    expect(harness.rows).toEqual([]);
    expect(harness.analyze).not.toHaveBeenCalled();
  });
});

describe('SPEC-017 AnalysisService — exactly one record per attempt (SC-006)', () => {
  it.each([
    ['success', {}],
    ['invalid output', { outcome: { status: 'available' as const, payload: {}, modelId: 'm', samplingParams: {} } }],
    [
      'provider outage',
      {
        outcome: {
          status: 'unavailable' as const,
          reason: 'transport' as const,
          modelId: 'm',
          samplingParams: {},
          possiblyCharged: false,
        },
      },
    ],
    ['disabled', { enabled: false }],
    ['cap exhausted', { admitted: false }],
  ])('writes one row for %s', async (_label, options) => {
    const harness = buildHarness(options);

    await run(harness);

    expect(harness.rows).toHaveLength(1);
  });
});
