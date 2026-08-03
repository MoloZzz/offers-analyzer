import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

import { AppConfig } from '../../src/common/config/configuration';
import { Currency } from '../../src/common/types/money';
import { Listing } from '../../src/modules/listings/entities/listing.entity';
import { ListingsService } from '../../src/modules/listings/listings.service';
import { RateBudgetService } from '../../src/modules/scheduling/rate-budget.service';
import { ListingDetail } from '../../src/modules/sources/ports/listing-source.port';
import { ValuationEvidence } from '../../src/modules/valuation/entities/valuation-evidence.entity';
import { ValuationEvidenceService } from '../../src/modules/valuation/valuation-evidence.service';
import { ValuationShadowService } from '../../src/modules/valuation/valuation-shadow.service';

const logger = { warn: jest.fn() } as unknown as PinoLogger;

function makeConfig(overrides: Partial<AppConfig> = {}): ConfigService<AppConfig, true> {
  const values: Partial<AppConfig> = {
    autoRiaAiEnabled: true,
    autoRiaAiApiKey: 'approved-key',
    autoRiaAiUserId: 'approved-user',
    autoRiaAiPolicyKey: 'ai-shadow-v1',
    autoRiaAiSampleRate: 1,
    autoRiaAiMonthlyAllocation: 3,
    ...overrides,
  };
  return { get: (key: keyof AppConfig): unknown => values[key] } as ConfigService<AppConfig, true>;
}

function makeListing(): Listing {
  return {
    id: 'listing-1',
    externalId: '38266770',
    lastScore: 0.89,
    lastDiscountPct: 26.7,
  } as Listing;
}

function makeDetail(): ListingDetail {
  return {
    externalId: '38266770',
    categoryId: 1,
    make: 'Audi',
    model: 'A6 Allroad',
    markId: 9,
    modelId: 3219,
    year: 2004,
    mileage: 305,
    fuelId: 2,
    fuel: 'Diesel',
    gearboxId: 1,
    gearbox: 'Automatic',
    driveId: 4,
    drive: 'All-wheel drive',
    bodyId: 1,
    body: 'Wagon',
    sellerType: 'private',
    hasVinReport: true,
    vinEvidence: { hasVinReport: true, vinChecked: true },
    url: 'https://auto.ria.com/auto_audi_a6_allroad_38266770.html',
    price: { amount: 5000, currency: Currency.USD },
    risk: {
      damaged: false,
      salvage: false,
      unclearCustoms: false,
      confiscated: false,
      underCredit: false,
      abroad: false,
      vinChecked: true,
    },
  };
}

function makeEvidence(overrides: Partial<ValuationEvidence> = {}): ValuationEvidence {
  return {
    id: 'evidence-1',
    listingId: 'listing-1',
    policyKey: 'ai-shadow-v1',
    requestFingerprint: 'a'.repeat(64),
    status: 'available',
    failureCode: null,
    estimateAmount: 5000,
    currency: 'USD',
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as ValuationEvidence;
}

function buildService(options: {
  config?: ConfigService<AppConfig, true>;
  budgetAllowed?: boolean;
  evidence?: Partial<ValuationEvidenceService>;
}) {
  const budget = {
    tryConsume: jest.fn().mockResolvedValue(options.budgetAllowed ?? true),
    markExhausted: jest.fn().mockResolvedValue(undefined),
  } as unknown as RateBudgetService & { tryConsume: jest.Mock; markExhausted: jest.Mock };
  const evidence = {
    findLatestForListing: jest.fn().mockResolvedValue(null),
    maybeCapture: jest.fn().mockResolvedValue(makeEvidence()),
    record: jest.fn().mockResolvedValue(makeEvidence({ status: 'deferred', failureCode: 'budget_denied' })),
    ...options.evidence,
  } as unknown as ValuationEvidenceService & {
    findLatestForListing: jest.Mock;
    maybeCapture: jest.Mock;
    record: jest.Mock;
  };
  const listings = {
    recordValuationEvidenceProjection: jest.fn().mockResolvedValue(undefined),
  } as unknown as ListingsService & { recordValuationEvidenceProjection: jest.Mock };
  const provider = {
    key: 'auto-ria-ai' as const,
    adapterVersion: 'auto-ria-ai-v1',
    valuate: jest.fn(),
  };
  return {
    service: new ValuationShadowService(
      options.config ?? makeConfig(),
      budget,
      evidence,
      listings,
      provider,
      logger,
    ),
    budget,
    evidence,
    listings,
    provider,
  };
}

describe('ValuationShadowService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('persists not-configured evidence for a deterministic shadow selection without paid traffic', async () => {
    const notConfigured = makeEvidence({ status: 'not_configured', failureCode: 'not_configured' });
    const { service, budget, evidence } = buildService({
      config: makeConfig({ autoRiaAiEnabled: false }),
      evidence: { record: jest.fn().mockResolvedValue(notConfigured) },
    });

    await expect(service.capturePollShadow({ listing: makeListing(), detail: makeDetail() })).resolves.toBe(
      notConfigured,
    );

    expect(budget.tryConsume).not.toHaveBeenCalled();
    expect(evidence.maybeCapture).not.toHaveBeenCalled();
    expect(evidence.record).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: { status: 'not_configured', failureCode: 'not_configured', chargeStatus: 'not_applicable' },
      }),
    );
  });

  it('admits deterministic shadow work through the dedicated operation allocation only', async () => {
    const { service, budget, evidence, listings } = buildService({});
    const listing = makeListing();

    const result = await service.capturePollShadow({
      listing,
      detail: makeDetail(),
      profileId: 'profile-1',
      legacyReference: { adjustedAmount: 6825, currency: Currency.USD, sampleSize: 23 },
    });

    expect(result?.status).toBe('available');
    expect(budget.tryConsume).toHaveBeenCalledWith(
      'auto-ria',
      1,
      5,
      expect.objectContaining({
        operation: 'valuation_ai',
        operationMonthlyAllocation: 3,
        profileId: 'profile-1',
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(evidence.maybeCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        listing,
        request: expect.objectContaining({
          queryMode: 'omni_id',
          sourceListingId: '38266770',
          target: 'active_listing_ask',
        }),
      }),
    );
    expect(listings.recordValuationEvidenceProjection).toHaveBeenCalled();
    expect(listing.lastScore).toBe(0.89);
  });

  it('records budget denial as deferred evidence without calling the provider path', async () => {
    const { service, budget, evidence } = buildService({ budgetAllowed: false });

    const result = await service.capturePollShadow({ listing: makeListing(), detail: makeDetail() });

    expect(budget.tryConsume).toHaveBeenCalledTimes(1);
    expect(evidence.maybeCapture).not.toHaveBeenCalled();
    expect(evidence.record).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: { status: 'deferred', failureCode: 'budget_denied', chargeStatus: 'not_charged' },
      }),
    );
    expect(result?.status).toBe('deferred');
  });
});
