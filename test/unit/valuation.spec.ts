import { ValuationService } from '../../src/modules/valuation/valuation.service';

describe('ValuationService (deal score −1..1)', () => {
  const service = new ValuationService();
  const base = {
    fairValue: 16000,
    sampleSize: 50,
    minSamples: 10,
    minScore: 0.3,
    sellerType: 'private' as const,
    hasVinReport: true,
  };

  it('scores a listing well below fair value as a positive opportunity', () => {
    const r = service.evaluate({ ...base, asking: 12000 }); // 25% below → raw ~0.83
    expect(r.isOpportunity).toBe(true);
    expect(r.score).toBeGreaterThan(0.3);
    expect(r.discountPct).toBeCloseTo(25, 0);
  });

  it('scores an overpriced listing negative and does not flag it', () => {
    const r = service.evaluate({ ...base, asking: 18000 }); // ~12.5% above → negative
    expect(r.score).toBeLessThan(0);
    expect(r.isOpportunity).toBe(false);
  });

  it('scores a fairly priced listing near zero', () => {
    const r = service.evaluate({ ...base, asking: 15800 });
    expect(Math.abs(r.score)).toBeLessThan(0.3);
    expect(r.isOpportunity).toBe(false);
  });

  it('shrinks the score toward 0 when comparable data is thin', () => {
    const strong = service.evaluate({ ...base, asking: 12000, sampleSize: 50 });
    const weak = service.evaluate({ ...base, asking: 12000, sampleSize: 3 });
    expect(weak.score).toBeLessThan(strong.score);
    expect(weak.isOpportunity).toBe(false); // below minSamples
  });

  it('clamps a suspiciously large discount to ≤ 0 (likely scam)', () => {
    const r = service.evaluate({ ...base, asking: 6000 }); // ~62% below → disqualifying flag
    expect(r.redFlags.suspicious_discount).toBe(true);
    expect(r.score).toBeLessThanOrEqual(0);
    expect(r.isOpportunity).toBe(false);
  });

  it('respects a higher minimum deal score', () => {
    const strict = { ...base, minScore: 0.9 };
    expect(service.evaluate({ ...strict, asking: 12000 }).isOpportunity).toBe(false); // score ~0.83 < 0.9
    expect(service.evaluate({ ...strict, asking: 10500 }).isOpportunity).toBe(true); // ~34% below → score 1.0
  });
});
