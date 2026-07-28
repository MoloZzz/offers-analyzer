import { Currency } from '../../src/common/types/money';
import { ParametersService } from '../../src/modules/calibration/parameters.service';
import { ListingDetail } from '../../src/modules/sources/ports/listing-source.port';
import { ResolvedBenchmark } from '../../src/modules/valuation/cohort';
import {
  adjustFairForMileage,
  expectedMileageK,
  mileageAdjustmentPct,
  MileageAdjuster,
  MileageAdjustOptions,
} from '../../src/modules/valuation/mileage';

const opts: MileageAdjustOptions = {
  annualK: 15,
  per10kPct: 2,
  maxAdjPct: 20,
  now: new Date('2026-07-17T00:00:00Z'),
};

describe('mileage correction (percentage model, M2)', () => {
  it('expected mileage = age × annualK', () => {
    expect(expectedMileageK(2016, 15, opts.now)).toBe(150); // 10 yrs × 15k
    expect(expectedMileageK(2026, 15, opts.now)).toBe(0);
    expect(expectedMileageK(2030, 15, opts.now)).toBe(0); // future year floored to age 0
  });

  it('is 0% when mileage matches what is typical for the age', () => {
    expect(mileageAdjustmentPct(150, 2016, opts)).toBe(0);
  });

  it('lowers fair value for a higher-than-typical mileage', () => {
    // expected 150k, actual 200k → −50k dev → −10%
    expect(mileageAdjustmentPct(200, 2016, opts)).toBeCloseTo(-10, 5);
    expect(adjustFairForMileage(10000, 200, 2016, opts)).toBeCloseTo(9000, 5);
  });

  it('raises fair value for a lower-than-typical mileage', () => {
    // expected 150k, actual 50k → +100k dev → +20% (capped)
    expect(mileageAdjustmentPct(50, 2016, opts)).toBe(20);
    expect(adjustFairForMileage(10000, 50, 2016, opts)).toBeCloseTo(12000, 5);
  });

  it('clamps extreme deviations to ±maxAdjPct', () => {
    expect(mileageAdjustmentPct(400, 2016, opts)).toBe(-20); // would be −50%
  });

  it('does not raise value for an unverified claimed odometer', () => {
    expect(mileageAdjustmentPct(50, 2016, { ...opts, allowPositiveAdjustment: false })).toBe(0);
    expect(adjustFairForMileage(10000, 50, 2016, { ...opts, allowPositiveAdjustment: false })).toBe(10000);
  });

  it('can still lower value for a high claimed odometer without VIN evidence', () => {
    expect(mileageAdjustmentPct(200, 2016, { ...opts, allowPositiveAdjustment: false })).toBe(-10);
  });

  it('caps an old verified car positive uplift at 5%', () => {
    expect(mileageAdjustmentPct(168, 2004, { ...opts, maxPositiveAdjPct: 5 })).toBe(5);
  });

  it('is a no-op when mileage, fair, or year is unusable', () => {
    expect(adjustFairForMileage(10000, undefined, 2016, opts)).toBe(10000);
    expect(adjustFairForMileage(10000, 0, 2016, opts)).toBe(10000);
    expect(adjustFairForMileage(10000, 200, 0, opts)).toBe(10000);
    expect(adjustFairForMileage(0, 200, 2016, opts)).toBe(0);
  });
});

describe('MileageAdjuster claimed-mileage guard', () => {
  const parameters = {
    params: () => ({ mileageAnnualK: 15, mileagePer10kPct: 2, mileageMaxAdjPct: 20 }),
  } as unknown as ParametersService;
  const adjuster = new MileageAdjuster(parameters);
  const benchmark: ResolvedBenchmark = {
    value: { amount: 4056, currency: Currency.USD },
    sampleSize: 513,
    mileageAware: false,
    cohort: { key: 'cohort', tier: 'make_model_year' },
  };
  const detail = (overrides: Partial<ListingDetail> = {}): ListingDetail => ({
    externalId: '1', make: 'Opel', model: 'Astra', markId: 1, modelId: 2, year: 2004, mileage: 168,
    sellerType: 'private', hasVinReport: false, url: 'https://auto.ria.com/auto_1.html',
    price: { amount: 3100, currency: Currency.USD },
    risk: { damaged: false, salvage: false, unclearCustoms: false, confiscated: false, underCredit: false, abroad: false, vinChecked: false },
    ...overrides,
  });

  it('does not inflate fair value from an unverified low claimed mileage', () => {
    expect(adjuster.fairValue(benchmark, detail())).toBe(4056);
  });

  it('limits an old VIN-evidenced car to a 5% uplift', () => {
    expect(adjuster.fairValue(benchmark, detail({ hasVinReport: true }))).toBeCloseTo(4258.8, 5);
  });
});
