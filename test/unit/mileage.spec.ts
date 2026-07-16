import {
  adjustFairForMileage,
  expectedMileageK,
  mileageAdjustmentPct,
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

  it('is a no-op when mileage, fair, or year is unusable', () => {
    expect(adjustFairForMileage(10000, undefined, 2016, opts)).toBe(10000);
    expect(adjustFairForMileage(10000, 0, 2016, opts)).toBe(10000);
    expect(adjustFairForMileage(10000, 200, 0, opts)).toBe(10000);
    expect(adjustFairForMileage(0, 200, 2016, opts)).toBe(0);
  });
});
