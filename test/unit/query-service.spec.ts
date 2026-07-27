import { ConfigService } from '@nestjs/config';

import { Currency } from '../../src/common/types/money';
import { QueryService } from '../../src/modules/query/query.service';

describe('QueryService.whyById', () => {
  it('returns a stored explanation without fetching the external source', async () => {
    const source = { fetch: jest.fn() };
    const listings = {
      findByExternalIds: jest.fn().mockResolvedValue([
        {
          externalId: '40143820',
          lastExplanation: {
            schemaVersion: 1,
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
          },
        },
      ]),
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
    );

    const result = await service.whyById('40143820');

    expect(result.stored?.parameterSetVersion).toBe(2);
    expect(source.fetch).not.toHaveBeenCalled();
  });
});
