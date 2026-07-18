import {
  composeFactors,
  FactorScore,
  toSubScore100,
  toTotal100,
} from '../../src/modules/valuation/factors/factor';

function factor(modifier: number): FactorScore {
  return { factor: 'x', modifier, subScore100: toSubScore100(modifier), reasons: [] };
}

describe('composeFactors (spec 003 Phase F)', () => {
  it('returns the price core unchanged when there are no factors (SC-001)', () => {
    expect(composeFactors(0.75, [], 1.25)).toBe(0.75);
    expect(composeFactors(-0.4, [], 1.25)).toBe(-0.4);
    expect(composeFactors(0, [], 1.25)).toBe(0);
  });

  it('applies dampeners in full', () => {
    expect(composeFactors(1, [factor(0.8)], 1.25)).toBeCloseTo(0.8, 10);
    expect(composeFactors(1, [factor(0.8), factor(0.5)], 1.25)).toBeCloseTo(0.4, 10);
  });

  it('caps the combined uplift at upliftCap (price dominance)', () => {
    // 1.2 × 1.2 = 1.44 uplift, capped to 1.25
    expect(composeFactors(1, [factor(1.2), factor(1.2)], 1.25)).toBeCloseTo(1.25, 10);
    // a single uplift under the cap passes through
    expect(composeFactors(1, [factor(1.1)], 1.25)).toBeCloseTo(1.1, 10);
  });

  it('applies uplift and damp independently (damp never capped)', () => {
    // uplift 1.2 (≤cap) × damp 0.5
    expect(composeFactors(1, [factor(1.2), factor(0.5)], 1.25)).toBeCloseTo(0.6, 10);
  });
});

describe('toTotal100 / toSubScore100 (presentation)', () => {
  it('maps the signed score to 0..100 with at-market = 50', () => {
    expect(toTotal100(0)).toBe(50);
    expect(toTotal100(1)).toBe(100);
    expect(toTotal100(-1)).toBe(0);
    expect(toTotal100(0.75)).toBe(88);
  });

  it('clamps out-of-range scores', () => {
    expect(toTotal100(2)).toBe(100);
    expect(toTotal100(-2)).toBe(0);
  });

  it('maps a neutral modifier to 50 and bounds to 0/100', () => {
    expect(toSubScore100(1)).toBe(50);
    expect(toSubScore100(1.1)).toBe(100);
    expect(toSubScore100(0.9)).toBe(0);
  });
});
