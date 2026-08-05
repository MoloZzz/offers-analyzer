import { Listing } from '../../src/modules/listings/entities/listing.entity';
import { formatOpportunity } from '../../src/modules/notifications/format/opportunity-message';
import { Opportunity } from '../../src/modules/valuation/entities/opportunity.entity';
import { AssessmentConfidence } from '../../src/modules/valuation/valuation.types';

const listing = {
  make: 'BMW',
  model: '3 Series',
  year: 2017,
  mileage: 127,
  stateId: 12,
  cityId: 34,
  sellerType: 'private',
  url: 'https://auto.ria.com/auto_x.html',
} as unknown as Listing;

const opportunity = {
  askingValue: 12000,
  fairValue: 16000,
  discountPct: 25,
  confidence: 0.9,
  score: 0.75,
  currency: 'USD',
  sampleSize: 42,
  redFlags: { damaged: false, no_vin_report: true },
} as unknown as Opportunity;

describe('formatOpportunity', () => {
  const msg = formatOpportunity(opportunity, listing);

  it('includes the required region and sample size, plus seller and backlink', () => {
    expect(msg).toContain('12/34');
    expect(msg).toContain('(42');
    expect(msg).toContain('25%');
    expect(msg).toContain('https://auto.ria.com/auto_x.html');
  });

  it('rounds rendered prices to whole units for the operator-facing message', () => {
    const rounded = formatOpportunity(
      { ...opportunity, askingValue: 12000.6, fairValue: 15999.4 },
      listing,
    );

    expect(rounded).toMatch(/Ціна: 12\s*001 USD/);
    expect(rounded).toMatch(/Ринкова \(сер\.\): 15\s*999 USD/);
  });

  it('translates fired red-flags and omits non-fired ones', () => {
    expect(msg).toContain('VIN');
  });
});

/** Weight table of `assessment-confidence.ts`, in its own order. */
const WEIGHTS: Array<[key: string, weight: number]> = [
  ['vin_checked', 20],
  ['vin_report', 15],
  ['cohort_sample', 20],
  ['cohort_tier', 10],
  ['drivetrain_fields', 15],
  ['description', 10],
  ['mileage_plausible', 10],
];

/** `coverage` per input key, in weight-table order, turned into the persisted projection. */
function confidenceOf(percent: number, coverage: number[]): AssessmentConfidence {
  return {
    percent,
    floored: false,
    inputs: WEIGHTS.map(([key, weight], i) => ({
      key,
      weight,
      contribution: weight * coverage[i],
      present: coverage[i] >= 1,
    })),
    reasons: WEIGHTS.map(([key], i) => ({
      key,
      sign: coverage[i] >= 1 ? '✓' : '⚠',
      text: `${key} reason`,
    })),
  } as AssessmentConfidence;
}

function alertWith(confidence: AssessmentConfidence | null): string {
  return formatOpportunity(
    { ...opportunity, explanation: { schemaVersion: 3, assessmentConfidence: confidence } } as unknown as Opportunity,
    listing,
  );
}

/** Spec 006 US6.1 / SC-002 — one alert line, and never a fabricated one. */
describe('formatOpportunity — assessment confidence', () => {
  it('renders one line with the percent and the heaviest reasons when evidence is complete', () => {
    const line = alertWith(confidenceOf(100, [1, 1, 1, 1, 1, 1, 1]))
      .split('\n')
      .filter((l) => l.includes('Доказова база'));

    expect(line).toEqual(['🔎 Доказова база: 100% · ✓ перевірка VIN джерелом · ✓ VIN-звіт']);
  });

  it('names the biggest evidence gaps when confidence is low', () => {
    const line = alertWith(confidenceOf(18, [0, 0, 0.1, 0.3, 0.4, 0, 1]))
      .split('\n')
      .filter((l) => l.includes('Доказова база'));

    expect(line).toEqual([
      '🔎 Доказова база: 18% · ⚠ перевірка VIN джерелом · ⚠ обсяг вибірки порівнянних',
    ]);
  });

  it('renders nothing at all — no line, no placeholder — when the measure is absent', () => {
    for (const msg of [
      alertWith(null),
      formatOpportunity(opportunity, listing),
      formatOpportunity(
        { ...opportunity, explanation: { schemaVersion: 1 } } as unknown as Opportunity,
        listing,
      ),
    ]) {
      expect(msg).not.toContain('Доказова база');
      expect(msg).not.toContain('🔎');
      expect(msg.split('\n')).toHaveLength(7);
    }
  });

  it('leaves the score-decided part of the alert untouched', () => {
    const withConfidence = alertWith(confidenceOf(42, [0, 0, 1, 1, 1, 1, 1]));
    const without = formatOpportunity(opportunity, listing);

    expect(withConfidence.split('\n').filter((l) => !l.includes('Доказова база'))).toEqual(
      without.split('\n'),
    );
  });
});
