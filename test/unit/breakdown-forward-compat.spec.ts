import { Currency } from '../../src/common/types/money';
import {
  buildBreakdown,
  findLine,
  renderBreakdownFlat,
  renderBreakdownSections,
} from '../../src/modules/notifications/format/breakdown';
import {
  Breakdown,
  BreakdownSectionKey,
} from '../../src/modules/notifications/format/breakdown.types';
import {
  EvaluationExplanation,
  EvaluationExplanationV3,
} from '../../src/modules/valuation/evaluation-explanation';
import { AssessmentConfidence, MonetaryOutput } from '../../src/modules/valuation/valuation.types';

/**
 * Differential bare-vs-populated coverage for US16.4 (SC-005, SC-006) and the spec-018/ADR-0019 §8
 * boundary that keeps the AI-analysis block out of this breakdown. Complements
 * `breakdown.spec.ts` — deliberately does not repeat its single-fixture assertions, only the
 * comparison and the AI-absence property that file does not cover.
 */

const v1: EvaluationExplanation = {
  schemaVersion: 1,
  evaluatedAt: '2026-07-28T09:00:00.000Z',
  parameterSetVersion: 3,
  thresholdUsed: 0.63,
  listing: {
    externalId: '38561317',
    make: 'BMW',
    model: '3 Series',
    year: 2017,
    url: 'https://auto.ria.com/auto_38561317.html',
    askingAmount: 12000,
    currency: Currency.USD,
  },
  cohort: { key: 'BMW:3:2016-2018', tier: 'year±1', sampleSize: 12, mileageAware: false },
  fairValueBase: 15500,
  fairValueAdjusted: 16000,
  mileageAdjustment: 500,
  discountPct: 25,
  raw: 0.83,
  confidence: 0.9,
  penalty: 0.9,
  score: 0.75,
  priceCore: 0.75,
  total100: 88,
  factors: [],
  firedFlags: [{ code: 'desc_needs_repair', source: 'description' }],
  redFlags: { desc_needs_repair: true },
  reason: 'deal score 0.75 ≥ threshold 0.3',
  isOpportunity: true,
  disqualified: false,
};

function v3(extra: Partial<EvaluationExplanationV3> = {}): EvaluationExplanation {
  return { ...v1, schemaVersion: 3, ...extra } as EvaluationExplanationV3;
}

const confidence: AssessmentConfidence = {
  percent: 60,
  floored: false,
  inputs: [
    { key: 'vin_checked', present: false, weight: 20, contribution: 0 },
    { key: 'vin_report', present: true, weight: 15, contribution: 15 },
  ],
  reasons: [
    { key: 'vin_checked', sign: '⚠', text: 'no independent VIN check' },
    { key: 'vin_report', sign: '✓', text: 'a full VIN report is available' },
  ],
};

const monetary: MonetaryOutput = {
  x: 15000,
  b: 11400,
  torg: 0.05,
  cFix: 300,
  cRec: 800,
  cHold: 250,
  costs: [{ code: 'desc_needs_repair', probability: 0.4, cost: 2000, sigma: 500 }],
  z: 2250,
  roi: 18,
  kApplied: null,
  driftApplied: null,
} as unknown as MonetaryOutput;

/** V3 that carries the three US16.4 fields, but empty — the "carried, not measured" branch, never
 * the pre-schema `undefined` one (a hazard called out explicitly for this task). */
const bare = v3({ factors: [], assessmentConfidence: null, monetary: null });

const populated = v3({
  factors: [{ factor: 'liquidity', modifier: 1.05, subScore100: 72, reasons: ['+ швидкий сегмент'] }],
  assessmentConfidence: confidence,
  monetary,
});

function text(breakdown: Breakdown): string {
  return renderBreakdownFlat(breakdown).join('\n');
}

describe('breakdown forward-compat — the fixture flips, the renderer does not (US16.4, SC-006)', () => {
  it('emits byte-identical section keys whether or not the record carries factors/confidence/monetary', () => {
    const bareKeys = buildBreakdown(bare).sections.map((s) => s.key);
    const populatedKeys = buildBreakdown(populated).sections.map((s) => s.key);

    expect(populatedKeys).toEqual(bareKeys);
  });

  it('marks factors, confidence and monetary unavailable with a stated reason on the bare fixture', () => {
    const breakdown = buildBreakdown(bare);

    const factorsLine = breakdown.sections.find((s) => s.key === 'factors')?.lines[0];
    expect(factorsLine?.availability).toBe('unavailable');
    expect(factorsLine?.reason).toBe('inactive');
    expect(factorsLine?.value).toBeTruthy();

    const confidenceLine = findLine(breakdown, 'confidence', '🧭 Впевненість оцінки');
    expect(confidenceLine?.availability).toBe('unavailable');
    expect(confidenceLine?.reason).toBe('unmeasured');
    expect(confidenceLine?.value).toBeTruthy();

    const monetaryLine = findLine(breakdown, 'monetary', '💰 Грошовий підсумок');
    expect(monetaryLine?.availability).toBe('unavailable');
    expect(monetaryLine?.reason).toBe('unshipped');
    expect(monetaryLine?.value).toBeTruthy();
  });

  it('renders factors, confidence and monetary as available and traced to the fixture on the populated one', () => {
    const breakdown = buildBreakdown(populated);

    const factorsSection = breakdown.sections.find((s) => s.key === 'factors');
    expect(factorsSection?.lines).toHaveLength(1);
    expect(factorsSection?.lines[0].availability).toBe('available');
    expect(factorsSection?.lines[0].value).toBe('• liquidity: 72/100 — + швидкий сегмент');

    const confidencePercentLine = findLine(breakdown, 'confidence', '🧭 Впевненість оцінки');
    expect(confidencePercentLine?.availability).toBe('available');
    expect(confidencePercentLine?.value).toContain(`${confidence.percent}%`);

    const confidenceMsg = text(breakdown);
    expect(confidenceMsg).toContain(
      '⚠ перевірка VIN джерелом: no independent VIN check (внесок 0 з 20)',
    );
    expect(confidenceMsg).toContain(
      '✓ VIN-звіт: a full VIN report is available (внесок 15 з 15)',
    );

    const zLine = findLine(breakdown, 'monetary', '💰 Очікуваний прибуток (Z)');
    expect(zLine?.availability).toBe('available');
    expect(zLine?.value).toBe(`${(monetary.z as number).toLocaleString('uk-UA')} ${bare.listing.currency}`);

    const roiLine = findLine(breakdown, 'monetary', 'ROI');
    expect(roiLine?.availability).toBe('available');
    expect(roiLine?.value).toBe(`${monetary.roi}%`);
  });

  it('emits the same section titles in the same order whether the record is bare or populated', () => {
    const bareTitles = renderBreakdownSections(buildBreakdown(bare)).map((b) => b.split('\n')[0]);
    const populatedTitles = renderBreakdownSections(buildBreakdown(populated)).map(
      (b) => b.split('\n')[0],
    );

    expect(populatedTitles).toEqual(bareTitles);
  });

  it('keeps the monetary section subordinate to every score-justifying section (T019)', () => {
    const keys = buildBreakdown(populated).sections.map((s) => s.key);

    expect(keys.indexOf('monetary')).toBeGreaterThan(keys.indexOf('score'));
    expect(keys.indexOf('monetary')).toBeGreaterThan(keys.indexOf('factors'));
    expect(keys.indexOf('monetary')).toBeGreaterThan(keys.indexOf('confidence'));
  });

  it('never carries a spec-017 AI-analysis section — that block is /analyze_ai-only (ADR-0019 §8, T019)', () => {
    const allowedKeys: BreakdownSectionKey[] = [
      'identity',
      'price',
      'cohort',
      'mileage',
      'provider',
      'score',
      'factors',
      'flags',
      'confidence',
      'monetary',
      'verdict',
    ];
    // The union has no AI-analysis member at all — a future `assemble()` addition would show up
    // here as an extra key not in this closed allow-list, failing the assertion below.
    for (const breakdown of [buildBreakdown(bare), buildBreakdown(populated)]) {
      const keys = breakdown.sections.map((s) => s.key);
      for (const key of keys) {
        expect(allowedKeys).toContain(key);
      }
      expect(keys).toHaveLength(allowedKeys.length);

      const rendered = renderBreakdownSections(breakdown).join('\n\n');
      expect(rendered).not.toMatch(/AI[- ]?аналіз/i);
      expect(rendered).not.toMatch(/аналіз ШІ/i);
    }
  });
});
