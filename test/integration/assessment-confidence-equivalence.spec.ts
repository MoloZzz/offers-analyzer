/**
 * Spec 006 T005 — the alerting set is unchanged (FR-003, SC-001).
 *
 * T004 asserts the property on `computeValuation`'s return values. This asserts the thing the
 * operator actually experiences: run the **real** pipeline — `resolveBenchmark` + `MileageAdjuster`
 * + `ValuationService` — over a mixed batch and compare *which listings alert*, as a set. A defect
 * that leaked confidence into the score through the benchmark or mileage stages, rather than through
 * `computeValuation` itself, would be invisible to a unit test and caught here.
 *
 * Same shape and same lever discipline as `test/integration/accident-shadow-equivalence.spec.ts`:
 * one stub differs from the other in exactly one thing, and the whole observable projection is
 * compared with `toEqual`.
 */
import { Currency } from '../../src/common/types/money';
import { ScoringParams } from '../../src/modules/calibration/entities/parameter-set.entity';
import {
  buildSeedParams,
  ParametersService,
} from '../../src/modules/calibration/parameters.service';
import { ListingDetail, ListingSource } from '../../src/modules/sources/ports/listing-source.port';
import { BenchmarkCacheService } from '../../src/modules/valuation/benchmark-cache.service';
import { resolveBenchmark } from '../../src/modules/valuation/cohort';
import {
  HeuristicTables,
  HeuristicTablesService,
} from '../../src/modules/valuation/factors/tables';
import { MileageAdjuster } from '../../src/modules/valuation/mileage';
import { ValuationService } from '../../src/modules/valuation/valuation.service';

const BASE = buildSeedParams({ mileageAnnualK: 15, mileagePer10kPct: 2, mileageMaxAdjPct: 20 });
const noTables = { get: (): HeuristicTables => ({}) } as unknown as HeuristicTablesService;

const paramsOf = (params: ScoringParams) =>
  ({ params: () => params }) as unknown as ParametersService;

/** The pre-006 world: no `confidenceWeights` on the active set, so the measure never runs. */
const OFF = { ...BASE, confidenceWeights: undefined };
/** US6.1 as it ships. */
const ON = { ...BASE, confidenceWeights: {} };
/** Enabled with a table nothing like the default one — the percent moves, the alert set may not. */
const RESKEWED = {
  ...BASE,
  confidenceWeights: { vin_checked: 300, cohort_sample: 0, cohort_tier: 0, description: 0 },
};

function pipelineFor(params: ScoringParams) {
  const p = paramsOf(params);
  return { mileage: new MileageAdjuster(p), valuation: new ValuationService(p, noTables) };
}

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

/**
 * A batch spread across the alert threshold on purpose. If every case were a clear yes or a clear
 * no, the set comparison would survive a small score perturbation and prove nothing — the near-miss
 * and the just-over case are what make it sharp. Their evidence coverage is also spread, so the
 * confidence percent varies widely across the batch.
 */
const BATCH: ReadonlyArray<{
  label: string;
  detail: ListingDetail;
  avgAmount: number;
  sampleSize: number;
}> = [
  {
    label: 'clean, fully evidenced, deep discount',
    detail: detail({
      externalId: '1',
      gearbox: 'Автомат',
      engine: '2.0d',
      body: 'Седан',
      fuel: 'Дизель',
      generation: 'F30',
      description:
        'Один власник, обслуговування у дилера, пробіг 120 тис. км, два комплекти коліс, сервісна книжка.',
    }),
    avgAmount: 16000,
    sampleSize: 50,
  },
  {
    label: 'deep discount but nothing known about the car',
    detail: detail({
      externalId: '2',
      hasVinReport: false,
      risk: { ...detail().risk, vinChecked: false },
    }),
    avgAmount: 16000,
    sampleSize: 50,
  },
  {
    label: 'just over the threshold',
    detail: detail({ externalId: '3', price: { amount: 13400, currency: Currency.USD } }),
    avgAmount: 16000,
    sampleSize: 50,
  },
  {
    label: 'just under the threshold',
    detail: detail({ externalId: '4', price: { amount: 13900, currency: Currency.USD } }),
    avgAmount: 16000,
    sampleSize: 50,
  },
  {
    label: 'at market',
    detail: detail({ externalId: '5', price: { amount: 16000, currency: Currency.USD } }),
    avgAmount: 16000,
    sampleSize: 50,
  },
  {
    label: 'overpriced',
    detail: detail({ externalId: '6', price: { amount: 19000, currency: Currency.USD } }),
    avgAmount: 16000,
    sampleSize: 50,
  },
  {
    label: 'cheap but damaged (a trap)',
    detail: detail({
      externalId: '7',
      price: { amount: 11000, currency: Currency.USD },
      risk: { ...detail().risk, damaged: true },
    }),
    avgAmount: 16000,
    sampleSize: 50,
  },
  {
    label: 'thin comparable data',
    detail: detail({ externalId: '8' }),
    avgAmount: 16000,
    sampleSize: 5,
  },
];

/** Runs the batch exactly as the poll does: resolve benchmark → mileage-adjust → evaluate. */
async function runBatch(params: ScoringParams) {
  const { mileage, valuation } = pipelineFor(params);
  const benchmarks = {
    getOrLoad: (_k: string, _c: unknown, loader: () => Promise<unknown>) => loader(),
  } as unknown as BenchmarkCacheService;

  const rows = [];
  for (const entry of BATCH) {
    const source = {
      key: 'auto-ria',
      averagePrice: () =>
        Promise.resolve({
          value: { amount: entry.avgAmount, currency: Currency.USD },
          sampleSize: entry.sampleSize,
        }),
    } as unknown as ListingSource;

    const benchmark = await resolveBenchmark(source, benchmarks, entry.detail);
    const fairValue = benchmark ? mileage.fairValue(benchmark, entry.detail) : 0;
    const d = entry.detail;
    const result = valuation.evaluate({
      asking: d.price.amount,
      fairValue,
      sampleSize: benchmark?.sampleSize ?? 0,
      minScore: 0.63,
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
      body: d.body,
      generation: d.generation,
      cohortTier: benchmark?.cohort.tier,
    });
    rows.push({ externalId: d.externalId, result, fairValue });
  }
  return rows;
}

/** The alerting set — the single property the whole spec promises not to disturb. */
const alertingSet = (rows: Awaited<ReturnType<typeof runBatch>>) =>
  rows.filter((r) => r.result.isOpportunity).map((r) => r.externalId);

/** Everything else the operator sees, per listing. */
const projection = (rows: Awaited<ReturnType<typeof runBatch>>) =>
  rows.map((r) => ({
    externalId: r.externalId,
    fairValue: r.fairValue,
    isOpportunity: r.result.isOpportunity,
    disqualified: r.result.disqualified,
    score: r.result.score,
    priceCore: r.result.priceCore,
    total100: r.result.total100,
    discountPct: r.result.discountPct,
    redFlags: r.result.redFlags,
    reason: r.result.reason,
    factors: r.result.factors,
  }));

describe('spec 006 T005 — assessment confidence does not change which listings alert', () => {
  let off: Awaited<ReturnType<typeof runBatch>>;
  let on: Awaited<ReturnType<typeof runBatch>>;
  let reskewed: Awaited<ReturnType<typeof runBatch>>;

  beforeAll(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-04T12:00:00.000Z'));
    try {
      off = await runBatch(OFF);
      on = await runBatch(ON);
      reskewed = await runBatch(RESKEWED);
    } finally {
      jest.useRealTimers();
    }
  });

  it('alerts on exactly the same listings with the measure enabled', () => {
    expect(alertingSet(on)).toEqual(alertingSet(off));
  });

  it('alerts on exactly the same listings under a different weight table', () => {
    expect(alertingSet(reskewed)).toEqual(alertingSet(off));
  });

  it('reproduces the whole scoring projection bit-for-bit', () => {
    expect(projection(on)).toEqual(projection(off));
    expect(projection(reskewed)).toEqual(projection(off));
  });

  // Guards against a vacuous pass: an empty (or all-inclusive) alerting set would satisfy every
  // equality above regardless of what the code does.
  it('has a batch that genuinely straddles the threshold', () => {
    const alerts = alertingSet(off);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.length).toBeLessThan(BATCH.length);
  });

  it('and a measure that genuinely varies across it', () => {
    const percents = on.map((r) => r.result.assessmentConfidence?.percent ?? -1);
    expect(percents.every((p) => p >= 0)).toBe(true);
    expect(Math.max(...percents) - Math.min(...percents)).toBeGreaterThanOrEqual(30);
    expect(off.every((r) => r.result.assessmentConfidence === null)).toBe(true);
  });
});
