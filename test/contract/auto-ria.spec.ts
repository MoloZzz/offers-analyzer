import { ConfigService } from '@nestjs/config';
import { MockAgent, setGlobalDispatcher } from 'undici';

import { AppConfig } from '../../src/common/config/configuration';
import { RateBudgetService } from '../../src/modules/scheduling/rate-budget.service';
import { AutoRiaSource } from '../../src/modules/sources/auto-ria/auto-ria.source';

/**
 * Contract test for the AUTO.RIA adapter. Uses undici's MockAgent (nock does not intercept
 * undici) so the live rate-limited endpoint is never called — constitution §VI.
 */
function makeSource(): AutoRiaSource {
  const config = { get: (): string => 'TEST_KEY' } as unknown as ConfigService<AppConfig, true>;
  const budget = { tryConsume: async (): Promise<boolean> => true } as unknown as RateBudgetService;
  return new AutoRiaSource(config, budget);
}

describe('AutoRiaSource (contract)', () => {
  let agent: MockAgent;

  beforeEach(() => {
    agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
  });

  afterEach(async () => {
    await agent.close();
  });

  it('parses search ids', async () => {
    agent
      .get('https://developers.ria.com')
      .intercept({ path: (p) => p.startsWith('/auto/search'), method: 'GET' })
      .reply(200, { result: { search_result: { ids: ['19050985', '19050986'] } } });

    const result = await makeSource().search({
      categoryId: 1,
      makeModelPairs: [{ markId: 9, modelId: 96 }],
    });
    expect(result.ids).toEqual(['19050985', '19050986']);
  });

  it('maps average price and sample size', async () => {
    agent
      .get('https://developers.ria.com')
      .intercept({ path: (p) => p.startsWith('/auto/average_price'), method: 'GET' })
      .reply(200, { arithmeticMean: 16000, total: 42 });

    const result = await makeSource().averagePrice({ markId: 9, modelId: 96 });
    expect(result.value.amount).toBe(16000);
    expect(result.sampleSize).toBe(42);
  });

  it('maps listing detail from info (real AUTO.RIA shape)', async () => {
    agent
      .get('https://developers.ria.com')
      .intercept({ path: (p) => p.startsWith('/auto/info'), method: 'GET' })
      .reply(200, {
        USD: 13000,
        markId: 9,
        modelId: 96,
        markName: 'Volkswagen',
        modelName: 'Passat',
        VIN: 'WVWZZZ3CZLE000000',
        haveInfotechReport: true,
        linkToView: '/auto_vw_passat_19050985.html',
        dealer: { id: 0 },
        stateData: { stateId: 5, cityId: 5 },
        autoData: { year: 2017, raceInt: 150 },
        autoInfoBar: {
          damage: false,
          custom: false,
          abroad: false,
          confiscatedCar: false,
          onRepairParts: false,
          underCredit: false,
        },
      });

    const detail = await makeSource().fetch('19050985');
    expect(detail.make).toBe('Volkswagen');
    expect(detail.markId).toBe(9);
    expect(detail.year).toBe(2017);
    expect(detail.mileage).toBe(150);
    expect(detail.price.amount).toBe(13000);
    expect(detail.sellerType).toBe('private');
    expect(detail.hasVinReport).toBe(true);
    expect(detail.risk.damaged).toBe(false);
    expect(detail.url).toBe('https://auto.ria.com/auto_vw_passat_19050985.html');
  });

  it('reads the damage red-flag from autoInfoBar', async () => {
    agent
      .get('https://developers.ria.com')
      .intercept({ path: (p) => p.startsWith('/auto/info'), method: 'GET' })
      .reply(200, {
        USD: 16500,
        markId: 9,
        modelId: 3219,
        markName: 'BMW',
        modelName: '3 Series',
        haveInfotechReport: true,
        linkToView: '/auto_bmw_3_series_38561317.html',
        dealer: { id: 0 },
        autoData: { year: 2017, raceInt: 127 },
        autoInfoBar: { damage: true },
      });

    const detail = await makeSource().fetch('38561317');
    expect(detail.risk.damaged).toBe(true);
  });
});
