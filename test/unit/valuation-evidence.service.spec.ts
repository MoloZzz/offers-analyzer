import { Currency } from '../../src/common/types/money';
import {
  ProviderValuationOutcome,
  ProviderValuationRequest,
  ProviderVehicleFacts,
  sourceProviderFact,
  unavailableProviderFact,
} from '../../src/modules/sources/ports/valuation-provider.port';
import { ValuationEvidence } from '../../src/modules/valuation/entities/valuation-evidence.entity';
import { ValuationEvidenceService } from '../../src/modules/valuation/valuation-evidence.service';

function completeFacts(): ProviderVehicleFacts {
  return {
    categoryId: sourceProviderFact(1),
    make: sourceProviderFact('Audi'),
    model: sourceProviderFact('A6 Allroad'),
    markId: sourceProviderFact(9),
    modelId: sourceProviderFact(3219),
    year: sourceProviderFact(2004),
    generationId: sourceProviderFact(100),
    generationName: sourceProviderFact('C5'),
    modificationId: sourceProviderFact(200),
    modificationName: sourceProviderFact('3.0 TDI'),
    bodyId: sourceProviderFact(1),
    bodyName: sourceProviderFact('Універсал'),
    fuelId: sourceProviderFact(2),
    fuelName: sourceProviderFact('Дизель'),
    gearboxId: sourceProviderFact(1),
    gearboxName: sourceProviderFact('Автомат'),
    driveId: sourceProviderFact(4),
    driveName: sourceProviderFact('Повний'),
    mileageK: sourceProviderFact(260),
    location: sourceProviderFact({ stateId: 10, cityId: 1 }),
    vinEvidence: sourceProviderFact({ hasVinReport: true, vinChecked: true }),
    conditionEvidence: sourceProviderFact({ signalCodes: [] }),
  };
}

/**
 * Yield the microtask queue until `until` holds (default: a fixed drain). Nothing under test uses
 * timers, so microtasks alone are enough; the bound only exists so a never-satisfied condition
 * fails loudly here instead of hanging until Jest's timeout.
 */
async function drainMicrotasks(until?: () => boolean, ticks = 100): Promise<void> {
  for (let i = 0; i < ticks; i += 1) {
    if (until?.()) return;
    await Promise.resolve();
  }
  if (until && !until()) throw new Error(`condition not satisfied after ${ticks} microtask ticks`);
}

function request(overrides: Partial<ProviderValuationRequest> = {}): ProviderValuationRequest {
  return {
    providerKey: 'auto-ria-ai',
    target: 'active_listing_ask',
    policyKey: 'ai-shadow-v1',
    adapterVersion: 'ai-shadow-contract-v1',
    period: 168,
    languageId: 4,
    queryMode: 'omni_id',
    sourceListingId: '38266770',
    normalizedFacts: completeFacts(),
    requestFingerprint: '',
    context: { trigger: 'poll_shadow', selectionReason: 'deterministic_sample', profileId: 'profile-1' },
    ...overrides,
  };
}

function availableOutcome(
  overrides: Partial<ProviderValuationOutcome> = {},
): ProviderValuationOutcome {
  return {
    providerKey: 'auto-ria-ai',
    target: 'active_listing_ask',
    adapterVersion: 'ai-shadow-contract-v1',
    queryMode: 'omni_id',
    status: 'available',
    retryable: false,
    chargeStatus: 'charged',
    requestProjection: {
      endpointPath: '/auto/ai-avarage-price/',
      method: 'POST',
      queryMode: 'omni_id',
      body: { omniId: '38266770', apiKey: 'never-store' },
    },
    sourceCapturedAt: new Date('2026-08-02T03:10:15.000Z'),
    estimate: { amount: 5000, currency: Currency.USD },
    statistics: {
      comparableCount: 23,
      minimum: { amount: 4882, currency: Currency.USD },
      maximum: { amount: 5395, currency: Currency.USD },
    },
    comparableSummary: { returnedCount: 1, retainedCount: 1, truncated: false, comparables: [] },
    providerMetadata: { adapterVersion: 'ai-shadow-contract-v1', queryMode: 'omni_id' },
    ...overrides,
  };
}

function evidenceRepository() {
  const rows: ValuationEvidence[] = [];
  let nextId = 1;
  const repo = {
    create: jest.fn((input: Partial<ValuationEvidence>) => ({
      id: `evidence-${nextId++}`,
      createdAt: new Date('2026-08-02T03:10:15.000Z'),
      ...input,
    }) as ValuationEvidence),
    save: jest.fn((entity: ValuationEvidence) => {
      rows.push(entity);
      return Promise.resolve(entity);
    }),
    findOne: jest.fn((options: { where: Partial<ValuationEvidence> }) => {
      const found = rows.filter((row) =>
        Object.entries(options.where).every(([key, value]) => row[key as keyof ValuationEvidence] === value),
      );
      return Promise.resolve(found[found.length - 1] ?? null);
    }),
    find: jest.fn(() => Promise.resolve([...rows])),
  };
  return { rows, repo };
}

function projectionRepository() {
  return { update: jest.fn().mockResolvedValue({ affected: 1 }) };
}

describe('ValuationEvidenceService', () => {
  it('persists one immutable available record, redacts it, and links projections after save', async () => {
    const evidence = evidenceRepository();
    const listings = projectionRepository();
    const opportunities = projectionRepository();
    const provider = { valuate: jest.fn().mockResolvedValue(availableOutcome()) };
    const service = new ValuationEvidenceService(
      evidence.repo as never,
      listings as never,
      opportunities as never,
      provider as never,
    );

    const saved = await service.maybeCapture({
      listing: { id: 'listing-1', externalId: '38266770' },
      request: request(),
      opportunityId: 'opportunity-1',
      legacyReference: { adjustedAmount: 6825, currency: Currency.USD, sampleSize: 23 },
      now: new Date('2026-08-02T03:10:15.000Z'),
    });

    expect(provider.valuate).toHaveBeenCalledTimes(1);
    expect(evidence.rows).toHaveLength(1);
    expect(saved.status).toBe('available');
    expect(saved.comparability).toBe('review');
    expect(saved.legacyReference?.providerDeltaPct).toBeCloseTo(-26.74, 2);
    expect(saved.requestProjection).toMatchObject({ body: { apiKey: '[redacted]' } });
    expect(saved.inputSnapshot.vinEvidence).toMatchObject({
      value: { hasVinReport: true, vinChecked: true },
    });
    expect(listings.update).toHaveBeenCalledWith(
      { id: 'listing-1' },
      { lastValuationEvidenceId: saved.id },
    );
    expect(opportunities.update).toHaveBeenCalledWith(
      { id: 'opportunity-1' },
      { valuationEvidenceId: saved.id },
    );
  });

  it('stores invalid attributes input without invoking the provider', async () => {
    const evidence = evidenceRepository();
    const provider = { valuate: jest.fn() };
    const service = new ValuationEvidenceService(evidence.repo as never, undefined, undefined, provider as never);
    const facts = completeFacts();
    facts.mileageK = unavailableProviderFact<number>();

    const saved = await service.maybeCapture({
      listing: { id: 'listing-1', externalId: '38266770' },
      request: request({ queryMode: 'attributes', sourceListingId: undefined, normalizedFacts: facts }),
    });

    expect(provider.valuate).not.toHaveBeenCalled();
    expect(saved.status).toBe('invalid_input');
    expect(saved.comparability).toBe('review');
    expect(saved.comparabilityReasons).toContain('attributes_mileage_required');
  });

  it('keeps an omni-ID estimate in review when provider comparables or material dimensions are absent', async () => {
    const evidence = evidenceRepository();
    const provider = {
      valuate: jest.fn().mockResolvedValue(
        availableOutcome({
          statistics: { comparableCount: 0 },
          comparableSummary: { returnedCount: 0, retainedCount: 0, truncated: false, comparables: [] },
        }),
      ),
    };
    const service = new ValuationEvidenceService(evidence.repo as never, undefined, undefined, provider as never);
    const facts = completeFacts();
    facts.generationId = unavailableProviderFact<number>();
    facts.generationName = unavailableProviderFact<string>();

    const saved = await service.maybeCapture({
      listing: { id: 'listing-1', externalId: '38266770' },
      request: request({ normalizedFacts: facts }),
      now: new Date('2026-08-02T03:10:15.000Z'),
    });

    expect(saved.status).toBe('available');
    expect(saved.comparability).toBe('review');
    expect(saved.comparabilityReasons).toEqual(
      expect.arrayContaining([
        'provider_comparable_evidence_insufficient',
        'material_dimension_missing:generation',
      ]),
    );
  });

  it('does not persist a provider-to-legacy delta across currencies', async () => {
    const evidence = evidenceRepository();
    const provider = {
      valuate: jest.fn().mockResolvedValue(
        availableOutcome({ estimate: { amount: 200000, currency: Currency.UAH } }),
      ),
    };
    const service = new ValuationEvidenceService(evidence.repo as never, undefined, undefined, provider as never);

    const saved = await service.maybeCapture({
      listing: { id: 'listing-1', externalId: '38266770' },
      request: request(),
      legacyReference: {
        adjustedAmount: 6825,
        currency: Currency.USD,
        providerDeltaAmount: -1825,
        providerDeltaPct: -26.74,
      },
      now: new Date('2026-08-02T03:10:15.000Z'),
    });

    expect(saved.legacyReference?.providerDeltaAmount).toBeUndefined();
    expect(saved.legacyReference?.providerDeltaPct).toBeUndefined();
    expect(saved.comparabilityReasons).toContain('legacy_currency_mismatch');
  });

  it('single-flights concurrent calls and reuses a fresh stored answer instead of mutating it', async () => {
    const evidence = evidenceRepository();
    // The deferred is built up front: `maybeCapture` awaits the freshness lookup before it reaches
    // the provider, so a resolver assigned inside `valuate` is not yet visible after a fixed number
    // of microtask ticks. Draining until the call actually lands keeps the test independent of how
    // many awaits precede it.
    let resolveProvider!: (outcome: ProviderValuationOutcome) => void;
    const providerCall = new Promise<ProviderValuationOutcome>((resolve) => {
      resolveProvider = resolve;
    });
    const provider = { valuate: jest.fn(() => providerCall) };
    const service = new ValuationEvidenceService(evidence.repo as never, undefined, undefined, provider as never);
    // `now` is pinned to the fixture's capture instant: freshness is measured against
    // `sourceCapturedAt`, so with the real clock the stored answer expires and the reuse leg of
    // this test silently becomes a second provider call.
    const input = {
      listing: { id: 'listing-1', externalId: '38266770' },
      request: request(),
      now: new Date('2026-08-02T03:10:15.000Z'),
    };

    const first = service.maybeCapture(input);
    await drainMicrotasks(() => provider.valuate.mock.calls.length === 1);
    const second = service.maybeCapture(input);
    await drainMicrotasks();
    expect(provider.valuate).toHaveBeenCalledTimes(1);

    resolveProvider(availableOutcome());
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.id).toBe(secondResult.id);
    expect(evidence.rows).toHaveLength(1);

    const reused = await service.maybeCapture(input);
    expect(reused.id).toBe(firstResult.id);
    expect(evidence.rows).toHaveLength(1);
    expect(provider.valuate).toHaveBeenCalledTimes(1);
  });

  it('does not reuse a fresh provider record across a changed frozen legacy evaluation', async () => {
    const evidence = evidenceRepository();
    const provider = { valuate: jest.fn().mockResolvedValue(availableOutcome()) };
    const service = new ValuationEvidenceService(evidence.repo as never, undefined, undefined, provider as never);
    const baseInput = {
      listing: { id: 'listing-1', externalId: '38266770' },
      request: request(),
      legacyReference: { adjustedAmount: 6825, currency: Currency.USD, sampleSize: 23 },
      now: new Date('2026-08-02T03:10:15.000Z'),
    };

    await service.maybeCapture(baseInput);
    await service.maybeCapture({
      ...baseInput,
      legacyReference: { adjustedAmount: 6200, currency: Currency.USD, sampleSize: 23 },
    });

    expect(provider.valuate).toHaveBeenCalledTimes(2);
    expect(evidence.rows).toHaveLength(2);
  });

  it('appends terminal attempts rather than overwriting history', async () => {
    const evidence = evidenceRepository();
    const service = new ValuationEvidenceService(evidence.repo as never);
    const input = { listing: { id: 'listing-1', externalId: '38266770' }, request: request() };

    await service.record({
      ...input,
      outcome: { status: 'not_configured', failureCode: 'not_configured', chargeStatus: 'not_applicable' },
    });
    await service.record({
      ...input,
      outcome: { status: 'deferred', failureCode: 'budget_denied', chargeStatus: 'not_charged' },
    });

    expect(evidence.rows).toHaveLength(2);
    expect(evidence.rows.map((row) => row.status)).toEqual(['not_configured', 'deferred']);
  });
});
