import { ConfigService } from '@nestjs/config';

import { Currency } from '../../src/common/types/money';
import { QueryService } from '../../src/modules/query/query.service';
import { ListingDetail } from '../../src/modules/sources/ports/listing-source.port';

describe('QueryService.whyById', () => {
  it('returns a stored explanation without fetching the external source', async () => {
    const source = { fetch: jest.fn() };
    const listings = {
      findByExternalIds: jest.fn().mockResolvedValue([
        {
          id: 'listing-1',
          externalId: '40143820',
          lastExplanation: {
            schemaVersion: 2,
            evaluatedAt: '2026-07-28T10:00:00.000Z',
            parameterSetVersion: 2,
            thresholdUsed: 0.3,
            listing: {
              externalId: '40143820',
              make: 'Hyundai',
              model: 'Sonata',
              year: 2013,
              url: 'https://auto.ria.com/auto_40143820.html',
              askingAmount: 8000,
              currency: Currency.USD,
            },
            cohort: { sampleSize: 12, mileageAware: false },
            fairValueBase: 10000,
            fairValueAdjusted: 9500,
            mileageAdjustment: -500,
            discountPct: 16,
            raw: 0.53,
            confidence: 1,
            penalty: 1,
            score: 0.53,
            priceCore: 0.53,
            total100: 77,
            factors: [],
            firedFlags: [],
            redFlags: {},
            reason: 'stored',
            isOpportunity: true,
            disqualified: false,
            providerEvidence: {
              evidenceId: 'evidence-for-this-evaluation',
              target: 'active_listing_ask',
              providerKey: 'auto-ria-ai',
              policyKey: 'ai-shadow-v1',
              adapterVersion: 'auto-ria-ai-v1',
              status: 'available',
              comparability: 'review',
              sourceCapturedAt: '2026-07-28T10:00:10.000Z',
              queryMode: 'omni_id',
              estimateAvailable: true,
              rangeAvailable: true,
              legacyDeltaPct: -20,
              reasonCodes: [],
            },
          },
        },
      ]),
    };
    const evidence = {
      findByIdForListing: jest
        .fn()
        .mockResolvedValue({ id: 'evidence-for-this-evaluation', status: 'available' }),
    };
    const config = { get: jest.fn().mockReturnValue(0.3) } as unknown as ConfigService;
    const service = new QueryService(
      source as never,
      {} as never,
      {} as never,
      listings as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      config as never,
      undefined,
      evidence as never,
    );

    const result = await service.whyById('40143820');

    expect(result.stored?.parameterSetVersion).toBe(2);
    expect(result.evidence).toMatchObject({ id: 'evidence-for-this-evaluation', status: 'available' });
    expect(evidence.findByIdForListing).toHaveBeenCalledWith('evidence-for-this-evaluation', 'listing-1');
    expect(source.fetch).not.toHaveBeenCalled();
  });
});

describe('QueryService.assessById shadow evidence', () => {
  it('persists a first manually checked listing before starting its shadow evidence sidecar', async () => {
    const detail: ListingDetail = {
      externalId: '38266770',
      make: 'Audi',
      model: 'A6 Allroad',
      markId: 9,
      modelId: 3219,
      year: 2004,
      mileage: 305,
      sellerType: 'private',
      hasVinReport: false,
      url: 'https://auto.ria.com/auto_audi_a6_allroad_38266770.html',
      price: { amount: 5000, currency: Currency.USD },
      risk: {
        damaged: false,
        salvage: false,
        unclearCustoms: false,
        confiscated: false,
        underCredit: false,
        abroad: false,
        vinChecked: false,
      },
    };
    const source = { fetch: jest.fn().mockResolvedValue(detail), averagePrice: jest.fn() };
    const valuation = {
      evaluate: jest.fn().mockReturnValue({
        isOpportunity: false,
        discountPct: 0,
        confidence: 0,
        score: 0,
        redFlags: {},
        reason: 'no benchmark',
        raw: 0,
        penalty: 1,
        disqualified: false,
        priceCore: 0,
        factors: [],
        total100: 0,
      }),
      activeParameterVersion: jest.fn().mockReturnValue(1),
    };
    const benchmarks = { getOrLoad: jest.fn().mockResolvedValue({ value: { amount: 0 }, sampleSize: 0 }) };
    const persistedListing = { id: 'listing-new', externalId: detail.externalId };
    const listings = {
      findByExternalIds: jest.fn().mockResolvedValue([]),
      recordSeen: jest.fn().mockResolvedValue({ listing: persistedListing }),
    };
    const shadow = { captureManualCheck: jest.fn().mockResolvedValue(null) };
    const config = {
      get: jest.fn((key: string) => (key === 'defaultMinDealScore' ? 0.75 : 10)),
    } as unknown as ConfigService;
    const service = new QueryService(
      source as never,
      valuation as never,
      benchmarks as never,
      listings as never,
      { fairValue: jest.fn().mockReturnValue(0) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      config as never,
      shadow as never,
    );

    await service.assessById(detail.externalId);

    expect(listings.recordSeen).toHaveBeenCalledWith(detail);
    expect(shadow.captureManualCheck).toHaveBeenCalledWith(
      expect.objectContaining({ listing: persistedListing, detail }),
    );
  });
});

describe('QueryService.valuationAudit', () => {
  it('reads only stored evidence and the existing budget report', async () => {
    const evidence = { findForAudit: jest.fn().mockResolvedValue([]) };
    const budget = {
      report: jest.fn().mockResolvedValue({
        poolRemaining: 100,
        reconciliationDifference: 0,
        operationActual: [{ operation: 'valuation_ai', allocation: 10, actual: 2, forecast: 5 }],
        deferred: [{ operation: 'valuation_ai', count: 1 }],
      }),
    };
    const config = { get: jest.fn().mockReturnValue(0.75) } as unknown as ConfigService;
    const service = new QueryService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      budget as never,
      {} as never,
      config as never,
      undefined,
      evidence as never,
    );

    const digest = await service.valuationAudit();

    expect(evidence.findForAudit).toHaveBeenCalledTimes(1);
    expect(budget.report).toHaveBeenCalledWith('auto-ria');
    expect(digest?.budget).toMatchObject({ allocation: 10, used: 2, forecast: 5, deferredCount: 1 });
  });
});
