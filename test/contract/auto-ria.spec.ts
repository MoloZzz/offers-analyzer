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

  it('maps listing detail from info', async () => {
    agent
      .get('https://developers.ria.com')
      .intercept({ path: (p) => p.startsWith('/auto/info'), method: 'GET' })
      .reply(200, {
        USD: 13000,
        markName: 'Volkswagen',
        modelName: 'Passat',
        marka_id: 9,
        model_id: 96,
        autoData: { year: 2017, race: 150 },
        dealer: false,
        linkToView: 'https://auto.ria.com/uk/auto_passat_19050985.html',
      });

    const detail = await makeSource().fetch('19050985');
    expect(detail.make).toBe('Volkswagen');
    expect(detail.year).toBe(2017);
    expect(detail.price.amount).toBe(13000);
    expect(detail.sellerType).toBe('private');
  });
});
