import { Currency } from '../../src/common/types/money';
import {
  buildBreakdown,
  buildLiveBreakdown,
  findLine,
  renderBreakdownFlat,
  renderBreakdownSections,
} from '../../src/modules/notifications/format/breakdown';
import { Breakdown } from '../../src/modules/notifications/format/breakdown.types';
import { ListingDetail } from '../../src/modules/sources/ports/listing-source.port';
import { ValuationEvidence } from '../../src/modules/valuation/entities/valuation-evidence.entity';
import {
  EvaluationExplanation,
  EvaluationExplanationV3,
} from '../../src/modules/valuation/evaluation-explanation';
import { ValuationResult } from '../../src/modules/valuation/valuation.service';
import { AssessmentConfidence, MonetaryOutput } from '../../src/modules/valuation/valuation.types';

/** A legacy V1 snapshot — the baseline every case varies from (spec 016 US16.1, FR-006). */
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

const v2: EvaluationExplanation = { ...v1, schemaVersion: 2, providerEvidence: null };

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

function text(breakdown: Breakdown): string {
  return renderBreakdownFlat(breakdown).join('\n');
}

describe('buildBreakdown — every parameter traces to a record field (SC-005)', () => {
  it('emits the sections in decision order regardless of schema version', () => {
    const order = (b: Breakdown) => b.sections.map((s) => s.key);
    const expected = [
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

    expect(order(buildBreakdown(v1))).toEqual(expected);
    expect(order(buildBreakdown(v2))).toEqual(expected);
    expect(order(buildBreakdown(v3()))).toEqual(expected);
  });

  it('renders the scoring values exactly as persisted, never recomputed', () => {
    const msg = text(buildBreakdown(v1));

    expect(msg).toContain('📊 Загальний бал: 88/100');
    expect(msg).toContain('Розклад балу: знижка → raw 0.83 × впевненість 0.9 × штраф 0.9 = 0.75');
    expect(msg).toMatch(/Ціна: 12\s*000 vs Ринкова: 16\s*000 USD → знижка 25%/);
    expect(msg).toMatch(/Ринкова база: 15\s*500 USD \(когорта без пробігу, вибірка 12\)/);
    expect(msg).toContain('Параметри: ParameterSet v3, поріг 0.63');
    expect(msg).toMatch(/Поправка на пробіг: \+500 USD/);
  });

  it('rounds all shown price values in the breakdown to whole units', () => {
    const msg = text(
      buildBreakdown({
        ...v1,
        listing: { ...v1.listing, askingAmount: 12000.6 },
        fairValueBase: 15500.4,
        fairValueAdjusted: 15999.6,
        mileageAdjustment: 500.4,
      }),
    );

    expect(msg).toMatch(/Ціна: 12\s*001 vs Ринкова: 16\s*000 USD → знижка 25%/);
    expect(msg).toMatch(/Ринкова база: 15\s*500 USD/);
    expect(msg).toMatch(/Поправка на пробіг: \+500 USD/);
  });

  it('carries the evaluation timestamp and ParameterSet version it reflects (FR-008)', () => {
    const breakdown = buildBreakdown(v1);

    expect(breakdown.evaluatedAt).toBe('2026-07-28T09:00:00.000Z');
    expect(breakdown.parameterSetVersion).toBe(3);
    expect(breakdown.schemaVersion).toBe(1);
  });
});

describe('buildBreakdown — absence is stated, never fabricated (FR-004)', () => {
  it('marks a version-missing field unavailable with the schema version as the reason', () => {
    for (const explanation of [v1, v2]) {
      const line = findLine(buildBreakdown(explanation), 'confidence', '🧭 Впевненість оцінки');

      expect(line?.availability).toBe('unavailable');
      expect(line?.reason).toBe('schema');
      expect(line?.value).toContain(`до появи цієї метрики (схема v${explanation.schemaVersion})`);
    }
  });

  it('distinguishes a V3 that carries no confidence from a version that never had the field', () => {
    const line = findLine(buildBreakdown(v3({ assessmentConfidence: null })), 'confidence', '🧭 Впевненість оцінки');

    expect(line?.availability).toBe('unavailable');
    expect(line?.reason).toBe('unmeasured');
    expect(line?.value).toContain('не мав ваг або розрахунок не вдався');
  });

  it('states that factors are inactive rather than emitting an empty section (US16.1 AS-2)', () => {
    const section = buildBreakdown(v1).sections.find((s) => s.key === 'factors');

    expect(section?.lines).toHaveLength(1);
    expect(section?.lines[0].availability).toBe('unavailable');
    expect(section?.lines[0].reason).toBe('inactive');
    expect(section?.lines[0].value).toContain('неактивні');
  });

  it('never renders an unavailable parameter as 0 or a bare dash', () => {
    const unavailable = buildBreakdown(v1)
      .sections.flatMap((s) => s.lines)
      .filter((l) => l.availability === 'unavailable');

    expect(unavailable.length).toBeGreaterThan(0);
    for (const line of unavailable) {
      expect(line.reason).toBeTruthy();
      expect(line.value.trim()).not.toBe('0');
      expect(line.value.trim()).not.toBe('—');
      expect(line.value.trim()).not.toBe('-');
    }
  });

  it('reports the mileage correction as inapplicable when the cohort already covers mileage', () => {
    const line = findLine(
      buildBreakdown({ ...v1, cohort: { ...v1.cohort, mileageAware: true } }),
      'mileage',
      'Поправка на пробіг',
    );

    expect(line?.availability).toBe('unavailable');
    expect(line?.value).toContain('когорта вже враховує пробіг');
  });
});

describe('buildBreakdown — fields render the moment records carry them (US16.4, SC-006)', () => {
  it('renders factors, assessment confidence and the monetary output with no renderer change', () => {
    const msg = text(
      buildBreakdown(
        v3({
          assessmentConfidence: confidence,
          monetary,
          factors: [{ factor: 'liquidity', modifier: 1.05, subScore100: 72, reasons: ['+ швидкий сегмент'] }],
        }),
      ),
    );

    expect(msg).toContain('• liquidity: 72/100 — + швидкий сегмент');
    expect(msg).toContain('🧭 Впевненість оцінки: 60%');
    expect(msg).toContain('⚠ перевірка VIN джерелом: no independent VIN check (внесок 0 з 20)');
    expect(msg).toMatch(/💰 Очікуваний прибуток \(Z\): 2\s*250 USD/);
    expect(msg).toContain('ROI: 18%');
  });

  it('keeps the monetary section subordinate to the score sections', () => {
    const keys = buildBreakdown(v3({ monetary })).sections.map((s) => s.key);

    expect(keys.indexOf('monetary')).toBeGreaterThan(keys.indexOf('score'));
    expect(keys.indexOf('monetary')).toBeGreaterThan(keys.indexOf('factors'));
  });

  it('does not render the spec-018 shadow accident verdict — it is admin-only until phase 3', () => {
    const msg = text(
      buildBreakdown(v3({ accidentSeverity: { level: 'major', confidence: 0.8, matches: [] } as never })),
    );

    expect(msg).not.toContain('major');
  });
});

describe('buildBreakdown — flags (FR-004 edge cases)', () => {
  it('groups fired flags by the source that produced them', () => {
    const line = findLine(
      buildBreakdown({
        ...v1,
        firedFlags: [
          { code: 'no_vin_report', source: 'auto-ria' },
          { code: 'desc_needs_repair', source: 'description' },
          { code: 'unverified_bargain', source: 'derived' },
        ],
      }),
      'flags',
      '⚠️ Ризики',
    );

    // `desc_*` labels carry their own `опис:` prefix, so the grouped line repeats it. Pre-existing
    // copy, deliberately preserved here: changing the labels is a `/why` copy change, not this spec.
    expect(line?.value).toBe(
      'дані AUTO.RIA: немає VIN-звіту · опис: опис: потребує ремонту · оцінка: завелика знижка без VIN-перевірки',
    );
  });

  it('falls back to the raw code rather than dropping an unlabelled flag', () => {
    const line = findLine(
      buildBreakdown({ ...v1, firedFlags: [{ code: 'future_flag', source: 'auto-ria' }] }),
      'flags',
      '⚠️ Ризики',
    );

    expect(line?.value).toContain('future_flag');
  });

  it('says no risk fired rather than leaving the line empty', () => {
    const line = findLine(buildBreakdown({ ...v1, firedFlags: [] }), 'flags', '⚠️ Ризики');

    expect(line?.value).toBe('не виявлено');
  });
});

describe('buildBreakdown — stored provider evidence only (FR-002)', () => {
  it('says the shadow estimate was not collected when no evidence row is passed', () => {
    const line = findLine(buildBreakdown(v2), 'provider', '📈 AUTO.RIA AI');

    expect(line?.availability).toBe('unavailable');
    expect(line?.reason).toBe('not-collected');
  });

  it('renders a stored evidence row without asserting it is a confirmed sale price', () => {
    const msg = text(
      buildBreakdown(v2, {
        id: 'evidence-1',
        status: 'available',
        estimateAmount: 5000,
        currency: Currency.USD,
        queryMode: 'omni_id',
        policyKey: 'ai-shadow-v1',
        adapterVersion: 'auto-ria-ai-v1',
        comparability: 'review',
        comparabilityReasons: [],
      } as unknown as ValuationEvidence),
    );

    expect(msg).toMatch(/📈 AUTO\.RIA AI — оцінка активного ринку: 5\s*000 USD\./);
    expect(msg).toContain('не підтверджена ціна продажу');
  });
});

describe('buildLiveBreakdown — a computation that was never persisted', () => {
  const detail = {
    externalId: '38561317',
    make: 'BMW',
    model: '3 Series',
    year: 2017,
    url: 'https://auto.ria.com/auto_38561317.html',
    price: { amount: 12000, currency: Currency.USD },
  } as unknown as ListingDetail;

  const result = {
    isOpportunity: true,
    discountPct: 25,
    confidence: 0.9,
    score: 0.75,
    redFlags: { desc_needs_repair: true, damaged: false },
    reason: 'deal score 0.75 ≥ threshold 0.3',
    raw: 0.83,
    penalty: 0.9,
    disqualified: false,
    priceCore: 0.75,
    factors: [],
    total100: 88,
    accidentSeverity: null,
    assessmentConfidence: null,
  } as unknown as ValuationResult;

  const live = buildLiveBreakdown(detail, result, {
    fairValue: 16000,
    currency: Currency.USD,
    sampleSize: 12,
    benchmarkBase: 15500,
    mileageAware: false,
  });

  it('produces the same sections in the same order as a stored record (SC-004)', () => {
    expect(live.sections.map((s) => s.key)).toEqual(buildBreakdown(v1).sections.map((s) => s.key));
  });

  it('states that the ParameterSet snapshot is missing rather than inventing one', () => {
    const line = findLine(live, 'identity', 'Параметри');

    expect(line?.availability).toBe('unavailable');
    expect(line?.reason).toBe('live');
    expect(live.parameterSetVersion).toBeNull();
    expect(live.schemaVersion).toBe(0);
  });

  it('classifies live red-flags by the same source rule the persisted record uses', () => {
    expect(findLine(live, 'flags', '⚠️ Ризики')?.value).toBe('опис: опис: потребує ремонту');
  });

  it('treats a live null confidence as not measured, not as too old a schema', () => {
    const line = findLine(live, 'confidence', '🧭 Впевненість оцінки');

    expect(line?.reason).toBe('unmeasured');
    expect(line?.value).not.toContain('схема v0');
  });
});

describe('renderBreakdownSections', () => {
  it('titles each section, which is what separates the Деталі view from /why', () => {
    const blocks = renderBreakdownSections(buildBreakdown(v1));

    expect(blocks[0].split('\n')[0]).toBe('🔍 Оцінка');
    expect(blocks.some((b) => b.startsWith('⚠️ Ризики\n'))).toBe(true);
    expect(renderBreakdownFlat(buildBreakdown(v1)).join('\n')).not.toContain('🔍 Оцінка\n');
  });
});
