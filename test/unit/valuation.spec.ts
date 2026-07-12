import { ValuationService } from '../../src/modules/valuation/valuation.service';

describe('ValuationService', () => {
  const service = new ValuationService();
  const base = {
    fairValue: 16000,
    sampleSize: 50,
    thresholdPct: 15,
    minSamples: 10,
    sellerType: 'private' as const,
    hasVinReport: true,
  };

  it('flags a listing priced well below fair value with enough data', () => {
    const r = service.evaluate({ ...base, asking: 13000 }); // ~18.75% below
    expect(r.isOpportunity).toBe(true);
    expect(r.discountPct).toBeCloseTo(18.75, 1);
    expect(r.score).toBeGreaterThan(0);
  });

  it('does not flag a fairly priced listing', () => {
    const r = service.evaluate({ ...base, asking: 15800 }); // ~1.25% below
    expect(r.isOpportunity).toBe(false);
    expect(r.reason).toContain('discount below threshold');
  });

  it('does not flag when comparable data is insufficient (low confidence)', () => {
    const r = service.evaluate({ ...base, asking: 12000, sampleSize: 3 });
    expect(r.isOpportunity).toBe(false);
    expect(r.reason).toContain('insufficient comparable data');
  });

  it('suppresses a suspiciously large discount (likely scam)', () => {
    const r = service.evaluate({ ...base, asking: 6000 }); // ~62.5% below
    expect(r.isOpportunity).toBe(false);
    expect(r.redFlags.suspicious_discount).toBe(true);
    expect(r.reason).toContain('red-flag');
  });

  it('respects a higher threshold', () => {
    const strict = { ...base, thresholdPct: 20 };
    expect(service.evaluate({ ...strict, asking: 13000 }).isOpportunity).toBe(false); // 18.75% < 20%
    expect(service.evaluate({ ...strict, asking: 12500 }).isOpportunity).toBe(true); // 21.875% >= 20%
  });
});
