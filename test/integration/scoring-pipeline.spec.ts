import { buildSeedParams, ParametersService } from '../../src/modules/calibration/parameters.service';
import { Currency } from '../../src/common/types/money';
import { BenchmarkCacheService } from '../../src/modules/valuation/benchmark-cache.service';
import { resolveBenchmark } from '../../src/modules/valuation/cohort';
import { HeuristicTables, HeuristicTablesService } from '../../src/modules/valuation/factors/tables';
import { MileageAdjuster } from '../../src/modules/valuation/mileage';
import { PHASE1_FACTOR_BOUNDS, ValuationService } from '../../src/modules/valuation/valuation.service';
import { ListingDetail, ListingSource } from '../../src/modules/sources/ports/listing-source.port';

/**
 * End-to-end scoring pipeline (B15): composes the REAL `resolveBenchmark` + `MileageAdjuster` +
 * `ValuationService` (with the v1 seed params) against a fake source, so we catch regressions across the
 * whole decision chain — the two guarantees: profitable deals aren't lost, traps/noise are filtered.
 * No DB (fake benchmark cache passes the loader straight through); deterministic.
 */

const V1 = { params: () => buildSeedParams({ mileageAnnualK: 15, mileagePer10kPct: 2, mileageMaxAdjPct: 20 }) } as unknown as ParametersService;
const noTables = { get: (): HeuristicTables => ({}) } as unknown as HeuristicTablesService;
const mileage = new MileageAdjuster(V1);
const valuation = new ValuationService(V1, noTables);

function detail(overrides: Partial<ListingDetail> = {}): ListingDetail {
  return {
    externalId: '40000001',
    make: 'BMW',
    model: '3 Series',
    markId: 9,
    modelId: 3219,
    year: 2017,
    mileage: 120,
    sellerType: 'private',
    hasVinReport: true,
    url: 'https://auto.ria.com/uk/auto_bmw_3_40000001.html',
    price: { amount: 12000, currency: Currency.USD },
    risk: {
      damaged: false,
      salvage: false,
      unclearCustoms: false,
      confiscated: false,
      underCredit: false,
      abroad: false,
      vinChecked: true,
    },
    ...overrides,
  };
}

/** Run the pipeline exactly as the poll does: resolve benchmark → mileage-adjust → evaluate. */
async function run(d: ListingDetail, avgAmount: number, sampleSize: number, minScore = 0.63) {
  const source = {
    key: 'auto-ria',
    averagePrice: async () => ({ value: { amount: avgAmount, currency: Currency.USD }, sampleSize }),
  } as unknown as ListingSource;
  const benchmarks = {
    getOrLoad: (_k: string, _c: unknown, loader: () => Promise<unknown>) => loader(),
  } as unknown as BenchmarkCacheService;

  const benchmark = await resolveBenchmark(source, benchmarks, d);
  const fairValue = benchmark ? mileage.fairValue(benchmark, d) : 0;
  const result = valuation.evaluate({
    asking: d.price.amount,
    fairValue,
    sampleSize: benchmark?.sampleSize ?? 0,
    minScore,
    minSamples: 10,
    sellerType: d.sellerType,
    hasVinReport: d.hasVinReport,
    damaged: d.risk.damaged,
    salvage: d.risk.salvage,
    unclearCustoms: d.risk.unclearCustoms,
    confiscated: d.risk.confiscated,
    underCredit: d.risk.underCredit,
    abroad: d.risk.abroad,
    description: d.description,
    mileageK: d.mileage,
    year: d.year,
    vinChecked: d.risk.vinChecked,
  });
  return { result, fairValue };
}

describe('scoring pipeline (integration, B15)', () => {
  it('flags a clean below-market car as an opportunity', async () => {
    const { result, fairValue } = await run(detail({ price: { amount: 12000, currency: Currency.USD } }), 16000, 50);
    expect(fairValue).toBe(16000); // mileage-banded cohort matched → no analytic correction
    expect(result.discountPct).toBeCloseTo(25, 0);
    expect(result.isOpportunity).toBe(true);
    expect(result.score).toBeGreaterThan(0.63);
  });

  it('does NOT flag an overpriced car', async () => {
    const { result } = await run(detail({ price: { amount: 18000, currency: Currency.USD } }), 16000, 50);
    expect(result.score).toBeLessThan(0);
    expect(result.isOpportunity).toBe(false);
  });

  it('disqualifies a cheap but damaged car (a trap, not a deal)', async () => {
    const d = detail({ price: { amount: 12000, currency: Currency.USD }, risk: { ...detail().risk, damaged: true } });
    const { result } = await run(d, 16000, 50);
    expect(result.redFlags.damaged).toBe(true);
    expect(result.score).toBeLessThanOrEqual(0);
    expect(result.isOpportunity).toBe(false);
  });

  it('does NOT flag when comparable data is too thin (no benchmark)', async () => {
    const { result, fairValue } = await run(detail(), 16000, 5); // sampleSize < MIN_USEFUL_SAMPLES
    expect(fairValue).toBe(0);
    expect(result.isOpportunity).toBe(false);
    expect(result.reason).toContain('insufficient');
  });

  it('fires the unverified-bargain flag and dampens the score (odometer-rollback guard)', async () => {
    const unverified = detail({
      price: { amount: 11000, currency: Currency.USD }, // ~31% below 16000
      hasVinReport: false,
      risk: { ...detail().risk, vinChecked: false },
    });
    const { result } = await run(unverified, 16000, 50);
    expect(result.redFlags.unverified_bargain).toBe(true);
    // still a big discount, but the soft penalty pulls the score below the clean 31%-off case
    expect(result.score).toBeLessThan(1);
  });

  it('fires the suspicious-low-mileage flag for implausibly low km', async () => {
    const lowKm = detail({ year: 2010, mileage: 40 }); // ~16 yrs old, 40k km
    const { result } = await run(lowKm, 16000, 50);
    expect(result.redFlags.suspicious_low_mileage).toBe(true);
  });

  // spec 003 US1 — with liquidity enabled (ParameterSet bounds + table), a liquid model outranks an
  // equally-discounted illiquid one, but neither can turn an at/above-market car into an opportunity.
  describe('liquidity factor (US1)', () => {
    const paramsWithFactors = {
      params: () => ({
        ...buildSeedParams({ mileageAnnualK: 15, mileagePer10kPct: 2, mileageMaxAdjPct: 20 }),
        factorBounds: { liquidity: PHASE1_FACTOR_BOUNDS.liquidity },
      }),
    } as unknown as ParametersService;
    const tables = {
      get: (): HeuristicTables => ({
        liquidity: { version: 't', models: { 'toyota|camry': 'A', 'jaguar|xf': 'D' }, makes: {} },
      }),
    } as unknown as HeuristicTablesService;
    const valuationF = new ValuationService(paramsWithFactors, tables);

    // Identical price/cohort inputs (18.75% below market, plenty of data) — only the model differs.
    const evalFor = (make: string, model: string) =>
      valuationF.evaluate({
        asking: 13000,
        fairValue: 16000,
        sampleSize: 50,
        minScore: 0.3,
        minSamples: 10,
        make,
        model,
        sellerType: 'private',
        hasVinReport: true,
      });

    it('ranks a liquid model above an equally-discounted illiquid one', () => {
      const liquid = evalFor('Toyota', 'Camry');
      const illiquid = evalFor('Jaguar', 'XF');
      expect(liquid.score).toBeGreaterThan(illiquid.score);
      expect(liquid.factors[0]).toMatchObject({ factor: 'liquidity', modifier: 1.1 });
      expect(illiquid.factors[0]).toMatchObject({ factor: 'liquidity', modifier: 0.9 });
    });

    it('never turns an at/above-market listing into an opportunity (price dominance)', () => {
      const atMarket = valuationF.evaluate({
        asking: 16000, // exactly fair value → priceCore 0
        fairValue: 16000,
        sampleSize: 50,
        minScore: 0.3,
        minSamples: 10,
        make: 'Toyota',
        model: 'Camry', // maximal liquidity uplift
        sellerType: 'private',
        hasVinReport: true,
      });
      expect(atMarket.isOpportunity).toBe(false);
    });
  });

  // spec 003 US2 — with repair-risk enabled, a reliable model outranks an equally-discounted
  // expensive-to-maintain one (SC-002).
  describe('repair-risk factor (US2)', () => {
    const paramsRR = {
      params: () => ({
        ...buildSeedParams({ mileageAnnualK: 15, mileagePer10kPct: 2, mileageMaxAdjPct: 20 }),
        factorBounds: { 'repair-risk': PHASE1_FACTOR_BOUNDS['repair-risk'] },
      }),
    } as unknown as ParametersService;
    const tables = {
      get: (): HeuristicTables => ({
        repairRisk: {
          version: 't',
          models: { 'toyota|corolla': 'LOW' },
          makes: { bmw: 'HIGH' },
          patterns: [],
        },
      }),
    } as unknown as HeuristicTablesService;
    const valuationRR = new ValuationService(paramsRR, tables);

    const evalFor = (make: string, model: string) =>
      valuationRR.evaluate({
        asking: 13000,
        fairValue: 16000,
        sampleSize: 50,
        minScore: 0.3,
        minSamples: 10,
        make,
        model,
        sellerType: 'private',
        hasVinReport: true,
      });

    it('ranks a reliable model above an equally-discounted high-repair-risk one', () => {
      const reliable = evalFor('Toyota', 'Corolla'); // LOW → 1.05
      const risky = evalFor('BMW', '5 Series'); // make HIGH → 0.85
      expect(reliable.score).toBeGreaterThan(risky.score);
      expect(reliable.factors[0]).toMatchObject({ factor: 'repair-risk', modifier: 1.05 });
      expect(risky.factors[0]).toMatchObject({ factor: 'repair-risk', modifier: 0.85 });
    });
  });
});
