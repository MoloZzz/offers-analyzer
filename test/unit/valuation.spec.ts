import { buildSeedParams } from '../../src/modules/calibration/parameters.service';
import { computeValuation } from '../../src/modules/valuation/valuation.service';

const V1 = buildSeedParams({ mileageAnnualK: 15, mileagePer10kPct: 2, mileageMaxAdjPct: 20 });

describe('ValuationService (deal score −1..1)', () => {
  const base = {
    fairValue: 16000,
    sampleSize: 50,
    minSamples: 10,
    minScore: 0.3,
    sellerType: 'private' as const,
    hasVinReport: true,
  };

  it('scores a listing well below fair value as a positive opportunity', () => {
    const r = computeValuation({ ...base, asking: 12000 }, V1); // 25% below → raw ~0.83
    expect(r.isOpportunity).toBe(true);
    expect(r.score).toBeGreaterThan(0.3);
    expect(r.discountPct).toBeCloseTo(25, 0);
  });

  it('scores an overpriced listing negative and does not flag it', () => {
    const r = computeValuation({ ...base, asking: 18000 }, V1); // ~12.5% above → negative
    expect(r.score).toBeLessThan(0);
    expect(r.isOpportunity).toBe(false);
  });

  it('scores a fairly priced listing near zero', () => {
    const r = computeValuation({ ...base, asking: 15800 }, V1);
    expect(Math.abs(r.score)).toBeLessThan(0.3);
    expect(r.isOpportunity).toBe(false);
  });

  it('shrinks the score toward 0 when comparable data is thin', () => {
    const strong = computeValuation({ ...base, asking: 12000, sampleSize: 50 }, V1);
    const weak = computeValuation({ ...base, asking: 12000, sampleSize: 3 }, V1);
    expect(weak.score).toBeLessThan(strong.score);
    expect(weak.isOpportunity).toBe(false); // below minSamples
  });

  it('clamps a suspiciously large discount to ≤ 0 (likely scam)', () => {
    const r = computeValuation({ ...base, asking: 6000 }, V1); // ~62% below → disqualifying flag
    expect(r.redFlags.suspicious_discount).toBe(true);
    expect(r.score).toBeLessThanOrEqual(0);
    expect(r.isOpportunity).toBe(false);
  });

  it('respects a higher minimum deal score', () => {
    const strict = { ...base, minScore: 0.9 };
    expect(computeValuation({ ...strict, asking: 12000 }, V1).isOpportunity).toBe(false); // score ~0.83 < 0.9
    expect(computeValuation({ ...strict, asking: 10500 }, V1).isOpportunity).toBe(true); // ~34% below → score 1.0
  });
});
