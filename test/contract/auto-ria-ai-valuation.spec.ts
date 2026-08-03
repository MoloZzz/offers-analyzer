import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { MockAgent, setGlobalDispatcher } from 'undici';

import configuration, { AppConfig } from '../../src/common/config/configuration';
import { Currency } from '../../src/common/types/money';
import {
  AUTO_RIA_AI_ADAPTER_VERSION,
  AUTO_RIA_AI_ENDPOINT_PATH,
  AutoRiaAiValuationProvider,
} from '../../src/modules/sources/auto-ria/auto-ria-ai-valuation.provider';
import {
  AUTO_RIA_AI_PROVIDER_KEY,
  ProviderVehicleFacts,
  ProviderValuationRequest,
  sourceProviderFact,
  unavailableProviderFact,
} from '../../src/modules/sources/ports/valuation-provider.port';

const noopLogger = {
  warn: () => {},
  error: () => {},
  info: () => {},
  debug: () => {},
} as unknown as PinoLogger;
const fixtureRoot = join(__dirname, '..', 'fixtures', 'auto-ria-ai');
const aiRequestPath = `${AUTO_RIA_AI_ENDPOINT_PATH}?api_key=TEST_KEY&user_id=TEST_USER_ID`;
const AI_ENV_KEYS = [
  'AUTO_RIA_AI_ENABLED',
  'AUTO_RIA_AI_API_KEY',
  'AUTO_RIA_AI_USER_ID',
  'AUTO_RIA_AI_POLICY_KEY',
  'AUTO_RIA_AI_SAMPLE_RATE',
  'AUTO_RIA_AI_MONTHLY_ALLOCATION',
  'AUTO_RIA_AI_TIMEOUT_MS',
] as const;

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureRoot, name), 'utf8')) as unknown;
}

function makeProvider(overrides: Record<string, unknown> = {}): AutoRiaAiValuationProvider {
  const values: Record<string, unknown> = {
    autoRiaAiEnabled: true,
    autoRiaAiApiKey: 'TEST_KEY',
    autoRiaAiUserId: 'TEST_USER_ID',
    autoRiaAiTimeoutMs: 500,
    ...overrides,
  };
  const config = {
    get: (key: string): unknown => values[key],
  } as unknown as ConfigService<AppConfig, true>;
  return new AutoRiaAiValuationProvider(config, noopLogger);
}

function makeFacts(overrides: Partial<ProviderVehicleFacts> = {}): ProviderVehicleFacts {
  return {
    categoryId: sourceProviderFact(1),
    make: sourceProviderFact('Volkswagen'),
    model: sourceProviderFact('Passat'),
    markId: sourceProviderFact(9),
    modelId: sourceProviderFact(96),
    year: sourceProviderFact(2017),
    generationId: sourceProviderFact(100),
    generationName: sourceProviderFact('B8'),
    modificationId: sourceProviderFact(200),
    modificationName: sourceProviderFact('2.0 TDI'),
    bodyId: sourceProviderFact(3),
    bodyName: sourceProviderFact('Sedan'),
    fuelId: sourceProviderFact(2),
    fuelName: sourceProviderFact('Дизель'),
    gearboxId: sourceProviderFact(1),
    gearboxName: sourceProviderFact('Автомат'),
    driveId: sourceProviderFact(2),
    driveName: sourceProviderFact('Передній'),
    mileageK: sourceProviderFact(150),
    location: sourceProviderFact({ stateId: 5, cityId: 5, stateName: 'Kyiv', cityName: 'Kyiv' }),
    vinEvidence: sourceProviderFact({ hasVinReport: true, vinChecked: true }),
    conditionEvidence: unavailableProviderFact(),
    ...overrides,
  };
}

function makeRequest(overrides: Partial<ProviderValuationRequest> = {}): ProviderValuationRequest {
  return {
    providerKey: AUTO_RIA_AI_PROVIDER_KEY,
    target: 'active_listing_ask',
    policyKey: 'ai-shadow-v1',
    adapterVersion: AUTO_RIA_AI_ADAPTER_VERSION,
    period: 168,
    languageId: 4,
    queryMode: 'omni_id',
    sourceListingId: '38266770',
    normalizedFacts: makeFacts(),
    requestFingerprint: 'request-fingerprint',
    context: { trigger: 'manual_check', selectionReason: 'manual' },
    ...overrides,
  };
}

describe('AutoRiaAiValuationProvider (contract)', () => {
  let agent: MockAgent;

  beforeEach(() => {
    agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
  });

  afterEach(async () => {
    await agent.close();
  });

  it('keeps paid provider traffic disabled with zero automatic allocation by default', () => {
    const previous = Object.fromEntries(AI_ENV_KEYS.map((key) => [key, process.env[key]]));
    try {
      for (const key of AI_ENV_KEYS) delete process.env[key];
      const config = configuration();
      expect(config).toMatchObject({
        autoRiaAiEnabled: false,
        autoRiaAiApiKey: '',
        autoRiaAiUserId: '',
        autoRiaAiPolicyKey: 'ai-shadow-v1',
        autoRiaAiSampleRate: 0,
        autoRiaAiMonthlyAllocation: 0,
        autoRiaAiTimeoutMs: 5000,
      });
    } finally {
      for (const key of AI_ENV_KEYS) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('uses the official omni-ID POST contract and redacts its evidence projection', async () => {
    let receivedPath = '';
    agent
      .get('https://developers.ria.com')
      .intercept({
        path: (path) => {
          receivedPath = path;
          return path === aiRequestPath;
        },
        method: 'POST',
        body: JSON.stringify({ langId: 4, period: 168, params: { omniId: '38266770' } }),
      })
      .reply(200, fixture('omni-id-success.json') as Record<string, unknown>);

    const outcome = await makeProvider().valuate(makeRequest());

    expect(receivedPath).toBe(aiRequestPath);
    expect(outcome).toMatchObject({
      status: 'available',
      chargeStatus: 'unknown',
      estimate: { amount: 5000, currency: Currency.USD },
      statistics: {
        comparableCount: 1,
        minimum: { amount: 4882, currency: Currency.USD },
        maximum: { amount: 5395, currency: Currency.USD },
      },
      comparableSummary: {
        returnedCount: 1,
        retainedCount: 1,
        truncated: false,
        comparables: [
          {
            sourceListingId: '38266770',
            make: 'audi',
            model: 'a6-allroad',
            year: 2004,
            mileageK: 305,
            price: { amount: 5000, currency: Currency.USD },
          },
        ],
      },
    });
    expect(outcome.sourceCapturedAt).toBeInstanceOf(Date);
    expect(outcome.requestProjection).toEqual({
      endpointPath: AUTO_RIA_AI_ENDPOINT_PATH,
      method: 'POST',
      queryMode: 'omni_id',
      body: { langId: 4, period: 168, params: { omniId: '38266770' } },
    });
    const persistedProjection = JSON.stringify(outcome);
    expect(persistedProjection).not.toContain('TEST_KEY');
    expect(persistedProjection).not.toContain('TEST_USER_ID');
    expect(persistedProjection).not.toContain('SANITIZED-VIN-MUST-NOT-LEAK');
    expect(persistedProjection).not.toContain('AA 0000 AA');
    expect(persistedProjection).not.toContain('/auto_audi_a6_allroad_38266770.html');
  });

  it('maps an attribute request using source IDs and exact mileage without sending VIN or description', async () => {
    const expectedBody = {
      langId: 4,
      period: 168,
      params: {
        categoryId: '1',
        brandId: '9',
        modelId: '96',
        year: { gte: '2017', lte: '2017' },
        mileage: { gte: '150', lte: '150' },
        stateId: '5',
        city_id: '5',
        generationId: '100',
        modificationId: '200',
        bodyId: '3',
        fuelId: '2',
        gearBoxId: '1',
        driveId: '2',
      },
    };
    agent
      .get('https://developers.ria.com')
      .intercept({
        path: aiRequestPath,
        method: 'POST',
        body: JSON.stringify(expectedBody),
      })
      .reply(200, fixture('attributes-success.json') as Record<string, unknown>);

    const outcome = await makeProvider().valuate(
      makeRequest({ queryMode: 'attributes', sourceListingId: undefined }),
    );

    expect(outcome.status).toBe('available');
    expect(outcome.estimate).toEqual({ amount: 13250, currency: Currency.USD });
    expect(JSON.stringify(outcome.requestProjection)).not.toMatch(/VIN|plate|description/i);
  });

  it('does not make an outbound call when disabled or when attributes lack actual mileage', async () => {
    let calls = 0;
    agent
      .get('https://developers.ria.com')
      .intercept({ path: (path) => path.startsWith(AUTO_RIA_AI_ENDPOINT_PATH), method: 'POST' })
      .reply(() => {
        calls += 1;
        return {
          statusCode: 200,
          data: fixture('omni-id-success.json') as Record<string, unknown>,
        };
      });

    const disabled = await makeProvider({ autoRiaAiEnabled: false }).valuate(makeRequest());
    const missingMileage = await makeProvider().valuate(
      makeRequest({
        queryMode: 'attributes',
        sourceListingId: undefined,
        normalizedFacts: makeFacts({ mileageK: unavailableProviderFact() }),
      }),
    );

    expect(disabled).toMatchObject({
      status: 'not_configured',
      failureCode: 'not_configured',
      chargeStatus: 'not_applicable',
    });
    expect(missingMileage).toMatchObject({
      status: 'invalid_input',
      failureCode: 'invalid_input',
      chargeStatus: 'not_applicable',
    });
    expect(calls).toBe(0);
  });

  it.each([
    [401, 'auth-failed.json', 'unavailable', 'auth_failed', false],
    [403, 'permission-denied.json', 'unavailable', 'permission_denied', false],
    [404, 'no-data.json', 'unavailable', 'not_found', false],
    [429, 'rate-limited.json', 'deferred', 'source_rate_limited', true],
    [503, 'server-error.json', 'unavailable', 'source_5xx', true],
    [200, 'no-data.json', 'unavailable', 'insufficient_data', false],
    [200, 'schema-invalid.json', 'unavailable', 'schema_invalid', false],
  ])(
    'maps HTTP/response failure %s to a terminal outcome without legacy fallback',
    async (statusCode, fixtureName, status, failureCode, retryable) => {
      let legacyCalls = 0;
      agent
        .get('https://developers.ria.com')
        .intercept({
          path: aiRequestPath,
          method: 'POST',
        })
        .reply(statusCode, fixture(fixtureName) as Record<string, unknown>);
      agent
        .get('https://developers.ria.com')
        .intercept({ path: (path) => path.startsWith('/auto/average_price'), method: 'GET' })
        .reply(() => {
          legacyCalls += 1;
          return { statusCode: 200, data: {} };
        });

      const outcome = await makeProvider().valuate(makeRequest());

      expect(outcome).toMatchObject({ status, failureCode, retryable, chargeStatus: 'unknown' });
      expect(legacyCalls).toBe(0);
    },
  );

  it('classifies a bounded transport timeout and leaves retry admission to the caller', async () => {
    agent
      .get('https://developers.ria.com')
      .intercept({
        path: aiRequestPath,
        method: 'POST',
      })
      .reply(200, fixture('timeout.json') as Record<string, unknown>)
      .delay(30);

    const outcome = await makeProvider({ autoRiaAiTimeoutMs: 1 }).valuate(makeRequest());

    expect(outcome).toMatchObject({
      status: 'unavailable',
      failureCode: 'timeout',
      retryable: true,
      chargeStatus: 'unknown',
    });
  });
});
