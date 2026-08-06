import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { MockAgent, setGlobalDispatcher } from 'undici';

import { AppConfig } from '../../src/common/config/configuration';
import { Currency } from '../../src/common/types/money';
import { RateBudgetService } from '../../src/modules/scheduling/rate-budget.service';
import { AutoRiaSource } from '../../src/modules/sources/auto-ria/auto-ria.source';
import { toProviderVehicleFacts } from '../../src/modules/sources/ports/listing-source.port';

const noopLogger = {
  warn: () => {},
  error: () => {},
  info: () => {},
  debug: () => {},
} as unknown as PinoLogger;

/**
 * Contract test for the AUTO.RIA adapter. Uses undici's MockAgent (nock does not intercept
 * undici) so the live rate-limited endpoint is never called — constitution §VI.
 */
function makeSource(): AutoRiaSource {
  const config = { get: (): string => 'TEST_KEY' } as unknown as ConfigService<AppConfig, true>;
  const budget = {
    tryConsume: (): Promise<boolean> => Promise.resolve(true),
  } as unknown as RateBudgetService;
  return new AutoRiaSource(config, budget, noopLogger);
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

  it('prefers the median over broader mean values', async () => {
    agent
      .get('https://developers.ria.com')
      .intercept({ path: (p) => p.startsWith('/auto/average_price'), method: 'GET' })
      .reply(200, {
        arithmeticMean: 12815,
        interQuartileMean: 10584,
        percentiles: { '50.0': 10998 },
        total: 3845,
      });

    const result = await makeSource().averagePrice({ markId: 9, modelId: 3219 });
    expect(result.value.amount).toBe(10998);
    expect(result.sampleSize).toBe(3845);
  });

  it('falls back to interquartile mean when the API omits a median', async () => {
    agent
      .get('https://developers.ria.com')
      .intercept({ path: (p) => p.startsWith('/auto/average_price'), method: 'GET' })
      .reply(200, { arithmeticMean: 12815, interQuartileMean: 10584, total: 20 });

    const result = await makeSource().averagePrice({ markId: 9, modelId: 3219 });
    expect(result.value.amount).toBe(10584);
  });

  it('sends the drivetrain band as gear_id and fuel_id', async () => {
    let seen = '';
    agent
      .get('https://developers.ria.com')
      .intercept({
        path: (p) => {
          if (p.startsWith('/auto/average_price')) seen = p;
          return p.startsWith('/auto/average_price');
        },
        method: 'GET',
      })
      .reply(200, { percentiles: { '50.0': 10998 }, total: 42 });

    await makeSource().averagePrice({
      markId: 9,
      modelId: 3219,
      yearFrom: 2017,
      yearTo: 2017,
      gearboxId: 2,
      fuelId: 1,
    });

    expect(seen).toContain('gear_id=2');
    expect(seen).toContain('fuel_id=1');
  });

  it('turns "Not Enough Data" into a zero-sample result, not a failure', async () => {
    // A thin cohort is an answer about the market, so the 24h cache may remember it; throwing
    // would make every listing in that cohort re-spend the request.
    agent
      .get('https://developers.ria.com')
      .intercept({ path: (p) => p.startsWith('/auto/average_price'), method: 'GET' })
      .reply(400, { message: 'Not Enough Data' });

    const result = await makeSource().averagePrice({ markId: 9, modelId: 3219 });
    expect(result.sampleSize).toBe(0);
    expect(result.value.amount).toBe(0);
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

  it('preserves provider-compatible AUTO.RIA facts without changing legacy detail fields', async () => {
    agent
      .get('https://developers.ria.com')
      .intercept({ path: (p) => p.startsWith('/auto/info'), method: 'GET' })
      .reply(200, {
        USD: 5000,
        markId: 5,
        modelId: 74,
        markName: 'Audi',
        modelName: 'A6 allroad',
        haveInfotechReport: false,
        checkedVin: { isChecked: true },
        dealer: { id: 1 },
        stateData: { stateId: 10, cityId: 20, stateName: 'Kyiv', cityName: 'Kyiv' },
        autoData: {
          categoryId: 1,
          year: 2004,
          raceInt: 305,
          generationId: 100,
          generationName: 'C5 (4B)',
          modificationId: 200,
          modificationName: '2.7 T quattro',
          bodyId: 3,
          bodyName: 'Wagon',
          fuelId: 1,
          fuelName: 'Бензин',
          gearBoxId: 2,
          gearboxName: 'Автомат',
          driveId: 4,
          driveName: 'Повний',
        },
      });

    const detail = await makeSource().fetch('38266770');
    const facts = toProviderVehicleFacts(detail);

    expect(detail.engine).toBe('2.7 T quattro');
    expect(detail.modificationId).toBe(200);
    expect(detail.generation).toBe('C5 (4B)');
    expect(facts).toMatchObject({
      categoryId: { availability: 'available', value: 1 },
      generationId: { availability: 'available', value: 100 },
      modificationName: { availability: 'available', value: '2.7 T quattro' },
      bodyName: { availability: 'available', value: 'Wagon' },
      fuelId: { availability: 'available', value: 1 },
      gearboxId: { availability: 'available', value: 2 },
      driveId: { availability: 'available', value: 4 },
      mileageK: { availability: 'available', value: 305 },
      location: {
        availability: 'available',
        value: { stateId: 10, cityId: 20, stateName: 'Kyiv', cityName: 'Kyiv' },
      },
      vinEvidence: { availability: 'available', value: { hasVinReport: false, vinChecked: true } },
    });
  });

  it('marks unavailable provider facts explicitly instead of inferring them', () => {
    const facts = toProviderVehicleFacts({
      externalId: '1',
      make: 'Audi',
      model: 'A6 allroad',
      markId: 5,
      modelId: 74,
      year: 2004,
      sellerType: 'unknown',
      hasVinReport: false,
      url: 'https://auto.ria.com/auto_audi_a6_allroad_1.html',
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
    });

    expect(facts.generationId).toEqual({
      availability: 'unavailable',
      provenance: 'not_provided',
      value: null,
    });
    expect(facts.mileageK.availability).toBe('unavailable');
    expect(facts.location.availability).toBe('unavailable');
    expect(facts.vinEvidence.availability).toBe('unavailable');
    expect(facts.conditionEvidence.availability).toBe('unavailable');
  });

  it('does not promote legacy zero sentinels into provider facts', () => {
    const facts = toProviderVehicleFacts({
      externalId: '1',
      make: 'Audi',
      model: 'A6 allroad',
      markId: 0,
      modelId: 0,
      categoryId: 0,
      year: 0,
      stateId: 0,
      cityId: 0,
      sellerType: 'unknown',
      hasVinReport: false,
      url: 'https://auto.ria.com/auto_audi_a6_allroad_1.html',
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
    });

    expect(facts.categoryId?.availability).toBe('unavailable');
    expect(facts.markId.availability).toBe('unavailable');
    expect(facts.modelId.availability).toBe('unavailable');
    expect(facts.year.availability).toBe('unavailable');
    expect(facts.location.availability).toBe('unavailable');
  });
});
