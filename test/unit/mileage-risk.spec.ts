import { assessMileageRisk } from '../../src/modules/valuation/mileage-risk';

const now = new Date('2026-07-17');

describe('assessMileageRisk (odometer-fraud / too-good-to-be-true heuristics)', () => {
  it('flags unverifiedBargain when discount is big and there is no VIN verification', () => {
    const r = assessMileageRisk({ discountPct: 40, hasVinReport: false, vinChecked: false, now });
    expect(r.unverifiedBargain).toBe(true);
  });

  it('does not flag unverifiedBargain when the VIN is verified', () => {
    const r = assessMileageRisk({ discountPct: 40, hasVinReport: true, vinChecked: false, now });
    expect(r.unverifiedBargain).toBe(false);
  });

  it('does not flag unverifiedBargain when the discount is small', () => {
    const r = assessMileageRisk({ discountPct: 10, hasVinReport: false, now });
    expect(r.unverifiedBargain).toBe(false);
  });

  it('flags suspiciousLowMileage for implausibly low mileage given the age', () => {
    // age 16 (2026-2010) × 5 = 80; 40 < 80
    const r = assessMileageRisk({ mileageK: 40, year: 2010, discountPct: 0, hasVinReport: true, now });
    expect(r.suspiciousLowMileage).toBe(true);
  });

  it('does not flag suspiciousLowMileage for plausible mileage', () => {
    // age 13 (2026-2013) × 5 = 65; 181 >= 65 — the real Sonata case, not flagged by this heuristic
    const r = assessMileageRisk({ mileageK: 181, year: 2013, discountPct: 0, hasVinReport: true, now });
    expect(r.suspiciousLowMileage).toBe(false);
  });

  it('does not flag suspiciousLowMileage when mileage or year is missing', () => {
    const r = assessMileageRisk({ discountPct: 0, hasVinReport: true, now });
    expect(r.suspiciousLowMileage).toBe(false);
  });
});
