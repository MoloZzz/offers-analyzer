import { liquidityFactor } from '../../src/modules/valuation/factors/liquidity';
import { LiquidityTable } from '../../src/modules/valuation/factors/tables';

const bounds = { min: 0.9, max: 1.1 };
const table: LiquidityTable = {
  version: 'test',
  models: { 'toyota|camry': 'A', 'bmw|3 series': 'B', 'jaguar|xf': 'D' },
  makes: { toyota: 'A', jaguar: 'D' },
};

describe('liquidityFactor (spec 003 US1)', () => {
  it('is off (null) when bounds or table are absent', () => {
    expect(liquidityFactor({ make: 'Toyota', model: 'Camry' }, undefined, bounds)).toBeNull();
    expect(liquidityFactor({ make: 'Toyota', model: 'Camry' }, table, undefined)).toBeNull();
  });

  it('returns null (neutral, omitted) when make/model are missing', () => {
    expect(liquidityFactor({ make: 'Toyota' }, table, bounds)).toBeNull();
    expect(liquidityFactor({}, table, bounds)).toBeNull();
  });

  it('maps a tier-A model to the upper bound (uplift), case-insensitively', () => {
    const f = liquidityFactor({ make: 'TOYOTA', model: 'Camry' }, table, bounds);
    expect(f?.modifier).toBe(1.1);
    expect(f?.reasons[0]).toContain('легко перепродати');
  });

  it('maps a tier-D model to the lower bound (dampening)', () => {
    const f = liquidityFactor({ make: 'Jaguar', model: 'XF' }, table, bounds);
    expect(f?.modifier).toBe(0.9);
  });

  it('maps a tier-B model to halfway up the bound', () => {
    const f = liquidityFactor({ make: 'BMW', model: '3 Series' }, table, bounds);
    expect(f?.modifier).toBeCloseTo(1.05, 10);
  });

  it('falls back to the make-level tier when the model is unlisted', () => {
    const f = liquidityFactor({ make: 'Toyota', model: 'Some New Model' }, table, bounds);
    expect(f?.modifier).toBe(1.1); // make toyota → A
  });

  it('yields a neutral modifier with an "unknown" reason for a fully unlisted model', () => {
    const f = liquidityFactor({ make: 'Zaz', model: 'Lanos' }, table, bounds);
    expect(f?.modifier).toBe(1);
    expect(f?.reasons[0]).toContain('невідома');
  });
});
