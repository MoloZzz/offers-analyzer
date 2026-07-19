import { repairRiskFactor } from '../../src/modules/valuation/factors/repair-risk';
import { FactorBound } from '../../src/modules/valuation/factors/factor';
import { RepairRiskTable } from '../../src/modules/valuation/factors/tables';

const mockBounds: FactorBound = { min: 0.85, max: 1.05 };

const mockTable: RepairRiskTable = {
  version: 'test',
  models: {
    'toyota|corolla': 'LOW',
    'bmw|3 series': 'HIGH',
  },
  makes: {
    'toyota': 'LOW',
    'bmw': 'HIGH',
  },
  patterns: [
    {
      tier: 'HIGH',
      gearbox: ['dsg', 'cvt'],
      minAge: 5,
      reason: 'DSG/варіатор — високий ризик після 5 років',
    },
    {
      tier: 'LOW',
      fuel: ['petrol'],
      engine: ['naturally aspirated'],
      maxAge: 15,
      reason: 'Атмосферний бензиновий — простіша конструкція',
    },
  ],
};

describe('repairRiskFactor (spec 003 US2)', () => {
  const currentYear = new Date().getFullYear();

  it('returns null when bounds or table missing', () => {
    expect(repairRiskFactor({ make: 'Toyota', model: 'Corolla' }, undefined, mockBounds)).toBeNull();
    expect(repairRiskFactor({ make: 'Toyota', model: 'Corolla' }, mockTable, undefined)).toBeNull();
  });

  it('returns null when make/model missing', () => {
    expect(repairRiskFactor({ make: '', model: 'Corolla' }, mockTable, mockBounds)).toBeNull();
    expect(repairRiskFactor({ make: 'Toyota', model: '' }, mockTable, mockBounds)).toBeNull();
  });

  it('uses explicit model tier (LOW) when listed', () => {
    const r = repairRiskFactor(
      { make: 'Toyota', model: 'Corolla', year: currentYear - 5 },
      mockTable,
      mockBounds,
    );
    expect(r).not.toBeNull();
    expect(r!.factor).toBe('repair-risk');
    expect(r!.modifier).toBeCloseTo(1.05, 2); // LOW → max
    expect(r!.reasons[0]).toContain('надійна');
  });

  it('uses explicit model tier (HIGH) when listed', () => {
    const r = repairRiskFactor(
      { make: 'BMW', model: '3 Series', year: currentYear - 5 },
      mockTable,
      mockBounds,
    );
    expect(r).not.toBeNull();
    expect(r!.modifier).toBeCloseTo(0.85, 2); // HIGH → min
    expect(r!.reasons[0]).toContain('високий риск');
  });

  it('falls back to make tier when model not listed', () => {
    const r = repairRiskFactor(
      { make: 'Toyota', model: 'UnknownModel', year: currentYear - 5 },
      mockTable,
      mockBounds,
    );
    expect(r).not.toBeNull();
    expect(r!.modifier).toBeCloseTo(1.05, 2); // LOW from make fallback
    expect(r!.reasons[0]).toContain('надійна');
  });

  it('matches gearbox pattern (DSG) → HIGH', () => {
    const r = repairRiskFactor(
      { make: 'VW', model: 'Golf', gearbox: 'DSG', year: currentYear - 6 },
      mockTable,
      mockBounds,
    );
    expect(r).not.toBeNull();
    expect(r!.modifier).toBeCloseTo(0.85, 2);
    expect(r!.reasons[0]).toContain('DSG');
  });

  it('does NOT match gearbox pattern when age too young', () => {
    const r = repairRiskFactor(
      { make: 'VW', model: 'Golf', gearbox: 'DSG', year: currentYear - 3 },
      mockTable,
      mockBounds,
    );
    expect(r).not.toBeNull();
    expect(r!.modifier).toBe(1); // neutral (pattern minAge=5 not met)
    expect(r!.reasons[0]).toBe('ризик ремонтності невідомий');
  });

  it('matches LOW pattern (atmospheric petrol) → LOW', () => {
    const r = repairRiskFactor(
      { make: 'Unknown', model: 'Car', fuel: 'petrol', engine: 'naturally aspirated', year: currentYear - 3 },
      mockTable,
      mockBounds,
    );
    expect(r).not.toBeNull();
    expect(r!.modifier).toBeCloseTo(1.05, 2); // LOW → max
    expect(r!.reasons[0]).toContain('Атмосферний');
  });

  it('prefers HIGH over MEDIUM over LOW when multiple patterns match', () => {
    const tableWithConflicts: RepairRiskTable = {
      version: 'test',
      models: {},
      makes: {},
      patterns: [
        { tier: 'LOW', fuel: ['petrol'], reason: 'low pattern' },
        { tier: 'HIGH', gearbox: ['dsg'], reason: 'high pattern' },
      ],
    };
    const r = repairRiskFactor(
      { make: 'VW', model: 'Golf', gearbox: 'DSG', fuel: 'Бензин', year: currentYear - 6 },
      tableWithConflicts,
      mockBounds,
    );
    expect(r).not.toBeNull();
    expect(r!.modifier).toBeCloseTo(0.85, 2); // HIGH wins
    expect(r!.reasons[0]).toContain('high pattern');
  });

  it('unknown model → neutral with reason', () => {
    const r = repairRiskFactor(
      { make: 'UnknownMake', model: 'UnknownModel', year: currentYear - 5 },
      mockTable,
      mockBounds,
    );
    expect(r).not.toBeNull();
    expect(r!.modifier).toBe(1);
    expect(r!.reasons[0]).toBe('ризик ремонтності невідомий');
  });
});