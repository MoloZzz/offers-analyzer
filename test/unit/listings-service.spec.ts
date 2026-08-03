import { Currency } from '../../src/common/types/money';
import { ExchangeRate } from '../../src/modules/fx/ports/exchange-rate.port';
import { Listing } from '../../src/modules/listings/entities/listing.entity';
import { PriceObservation } from '../../src/modules/listings/entities/price-observation.entity';
import { ListingsService } from '../../src/modules/listings/listings.service';
import { ListingDetail } from '../../src/modules/sources/ports/listing-source.port';
import { ValuationEvidence } from '../../src/modules/valuation/entities/valuation-evidence.entity';

function buildRepo<T extends { id?: string }>() {
  const rows: T[] = [];
  let nextId = 1;
  const result = {
    rows,
    findCalls: [] as unknown[],
    repo: {
      findOne: ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(rows.find((row) => Object.entries(where).every(([k, v]) => (row as never)[k] === v)) ?? null),
      find: (options?: unknown) => {
        result.findCalls.push(options);
        return Promise.resolve([...rows]);
      },
      create: (x: Partial<T>) => ({ id: `id-${nextId++}`, ...x } as T),
      save: (x: T) => {
        const idx = rows.findIndex((row) => row.id === x.id);
        if (idx === -1) rows.push(x);
        else rows[idx] = x;
        return Promise.resolve(x);
      },
      count: () => Promise.resolve(rows.length),
    } as never,
  } as const;
  return result;
}

function makeDetail(overrides: Partial<ListingDetail> = {}): ListingDetail {
  return {
    externalId: 'ext-1',
    make: 'Toyota',
    model: 'Camry',
    markId: 1,
    modelId: 2,
    year: 2018,
    sellerType: 'private',
    hasVinReport: false,
    url: 'https://example.test/1',
    price: { amount: 300000, currency: Currency.UAH },
    risk: {
      damaged: false,
      salvage: false,
      unclearCustoms: false,
      confiscated: false,
      underCredit: false,
      abroad: false,
      vinChecked: false,
    },
    ...overrides,
  };
}

describe('ListingsService.recordSeen', () => {
  it('normalizes UAH price observations into USD before storing them', async () => {
    const listings = buildRepo<Listing>();
    const observations = buildRepo<PriceObservation>();
    const fx: Pick<ExchangeRate, 'rate'> = {
      rate: jest.fn().mockResolvedValue(0.025),
    };
    const service = new ListingsService(listings.repo, observations.repo, fx as ExchangeRate);

    await service.recordSeen(makeDetail(), { seenInSearch: true });

    expect(fx.rate).toHaveBeenCalledWith(Currency.UAH, Currency.USD, expect.any(Date));
    expect(observations.rows).toHaveLength(1);
    expect(observations.rows[0].amount).toBe(300000);
    expect(observations.rows[0].currency).toBe(Currency.UAH);
    expect(observations.rows[0].amountUsd).toBe(7500);
  });
});

describe('ListingsService operator views', () => {
  it('requests only active listings for best and recent views', async () => {
    const listings = buildRepo<Listing>();
    const observations = buildRepo<PriceObservation>();
    const fx: Pick<ExchangeRate, 'rate'> = { rate: jest.fn() };
    const service = new ListingsService(listings.repo, observations.repo, fx as ExchangeRate);

    await service.topByScore();
    await service.getRecentlyEvaluated();

    expect(listings.findCalls).toHaveLength(2);
    expect(listings.findCalls[0]).toMatchObject({ where: { status: 'active' } });
    expect(listings.findCalls[1]).toMatchObject({ where: { status: 'active' } });
  });
});

describe('ListingsService shadow-evidence projection', () => {
  const expectedEvaluationAt = new Date('2026-08-02T03:10:15.000Z');
  const evidence = {
    id: 'evidence-1',
    target: 'active_listing_ask',
    providerKey: 'auto-ria-ai',
    policyKey: 'ai-shadow-v1',
    adapterVersion: 'auto-ria-ai-v1',
    status: 'available',
    comparability: 'review',
    sourceCapturedAt: expectedEvaluationAt,
    queryMode: 'omni_id',
    estimateAmount: 5000,
    comparabilityReasons: [],
  } as unknown as ValuationEvidence;

  function explanation(): Listing['lastExplanation'] {
    return {
      schemaVersion: 1,
      evaluatedAt: expectedEvaluationAt.toISOString(),
      parameterSetVersion: 1,
      thresholdUsed: 0.75,
      listing: {
        externalId: 'listing-1',
        make: 'Audi',
        model: 'A6 Allroad',
        year: 2004,
        url: 'https://example.test/1',
        askingAmount: 5000,
        currency: Currency.USD,
      },
      cohort: { sampleSize: 23, mileageAware: false },
      fairValueBase: 6500,
      fairValueAdjusted: 6825,
      mileageAdjustment: 325,
      discountPct: 26.7,
      raw: 0.89,
      confidence: 1,
      penalty: 1,
      score: 0.89,
      priceCore: 0.89,
      total100: 95,
      factors: [],
      firedFlags: [],
      redFlags: {},
      reason: 'stored',
      isOpportunity: true,
      disqualified: false,
    };
  }

  it('uses a guarded targeted update rather than saving a stale Listing entity', async () => {
    const current = {
      id: 'listing-1',
      lastScore: 0.89,
      currentAmount: 5000,
      lastEvaluatedAt: expectedEvaluationAt,
      lastExplanation: explanation(),
    } as Listing;
    const listings = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOneBy: jest.fn().mockResolvedValue(current),
      save: jest.fn(),
    };
    const service = new ListingsService(listings as never, {} as never, {} as never);

    await service.recordValuationEvidenceProjection('listing-1', evidence, expectedEvaluationAt);

    expect(listings.save).not.toHaveBeenCalled();
    expect(current.lastScore).toBe(0.89);
    expect(current.currentAmount).toBe(5000);
    expect(listings.update).toHaveBeenNthCalledWith(
      1,
      { id: 'listing-1' },
      { lastValuationEvidenceId: 'evidence-1' },
    );
    expect(listings.update).toHaveBeenNthCalledWith(
      2,
      { id: 'listing-1', lastEvaluatedAt: expectedEvaluationAt },
      {
        lastExplanation: expect.objectContaining({
          schemaVersion: 2,
          providerEvidence: expect.objectContaining({ evidenceId: 'evidence-1' }),
        }),
      },
    );
  });

  it('does not attach old evidence to a newer evaluation', async () => {
    const listings = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOneBy: jest.fn().mockResolvedValue({
        id: 'listing-1',
        lastEvaluatedAt: new Date('2026-08-02T03:10:16.000Z'),
        lastExplanation: explanation(),
      } as Listing),
    };
    const service = new ListingsService(listings as never, {} as never, {} as never);

    await service.recordValuationEvidenceProjection('listing-1', evidence, expectedEvaluationAt);

    expect(listings.update).toHaveBeenCalledTimes(1);
    expect(listings.update).toHaveBeenCalledWith(
      { id: 'listing-1' },
      { lastValuationEvidenceId: 'evidence-1' },
    );
  });
});
