import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { MockAgent, setGlobalDispatcher } from 'undici';

import { AppConfig } from '../../src/common/config/configuration';
import { Currency } from '../../src/common/types/money';
import { NbuExchangeRate } from '../../src/modules/fx/nbu-exchange-rate';

const noopLogger = { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} } as unknown as PinoLogger;

function makeFx(): NbuExchangeRate {
  const config = {
    get: (): string => 'https://bank.gov.ua/rates?json',
  } as unknown as ConfigService<AppConfig, true>;
  return new NbuExchangeRate(config, noopLogger);
}

describe('NbuExchangeRate (contract)', () => {
  let agent: MockAgent;

  beforeEach(() => {
    agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
  });

  afterEach(async () => {
    await agent.close();
  });

  it('converts USD → UAH using the NBU rate', async () => {
    agent
      .get('https://bank.gov.ua')
      .intercept({ path: () => true, method: 'GET' })
      .reply(200, [
        { cc: 'USD', rate: 41.5 },
        { cc: 'EUR', rate: 45 },
      ]);

    const rate = await makeFx().rate(Currency.USD, Currency.UAH);
    expect(rate).toBeCloseTo(41.5, 2);
  });

  it('returns 1 for the same currency (no fetch)', async () => {
    expect(await makeFx().rate(Currency.USD, Currency.USD)).toBe(1);
  });

  it('falls back to 1 when NBU is unavailable', async () => {
    agent.get('https://bank.gov.ua').intercept({ path: () => true, method: 'GET' }).reply(500, '');
    const rate = await makeFx().rate(Currency.USD, Currency.UAH);
    expect(rate).toBe(1);
  });
});
