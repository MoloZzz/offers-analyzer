import { Currency } from '../../src/common/types/money';
import { formatStoredWhy, formatWhy } from '../../src/modules/notifications/format/why-message';
import { ListingDetail } from '../../src/modules/sources/ports/listing-source.port';
import { ValuationEvidence } from '../../src/modules/valuation/entities/valuation-evidence.entity';
import { EvaluationExplanation } from '../../src/modules/valuation/evaluation-explanation';
import { ValuationResult } from '../../src/modules/valuation/valuation.service';
import { AssessmentConfidence, ConfidenceInputKey } from '../../src/modules/valuation/valuation.types';

const detail: ListingDetail = {
  externalId: '38561317',
  make: 'BMW',
  model: '3 Series',
  markId: 1,
  modelId: 2,
  year: 2017,
  mileage: 127,
  sellerType: 'private',
  hasVinReport: true,
  url: 'https://auto.ria.com/auto_38561317.html',
  price: { amount: 12000, currency: Currency.USD },
  risk: {
    damaged: false,
    salvage: false,
    unclearCustoms: false,
    confiscated: false,
    underCredit: false,
    abroad: false,
    vinChecked: false,
  },
  description: 'потребує ремонту двигуна',
};

const result: ValuationResult = {
  isOpportunity: true,
  discountPct: 25,
  confidence: 0.9,
  score: 0.75,
  redFlags: { damaged: false, no_vin_report: false, desc_needs_repair: true },
  reason: 'deal score 0.75 ≥ threshold 0.3',
  raw: 0.83,
  penalty: 0.9,
  disqualified: false,
  priceCore: 0.75,
  factors: [],
  total100: 88,
  accidentSeverity: null,
  assessmentConfidence: null,
};

/** A legacy V1 snapshot — the baseline every stored-explanation case below varies from. */
const baseStored: EvaluationExplanation = {
  schemaVersion: 1,
  evaluatedAt: '2026-07-28T09:00:00.000Z',
  parameterSetVersion: 3,
  thresholdUsed: 0.63,
  listing: {
    externalId: detail.externalId,
    make: detail.make,
    model: detail.model,
    year: detail.year,
    url: detail.url,
    askingAmount: detail.price.amount,
    currency: detail.price.currency,
  },
  cohort: { key: 'BMW:3:2016-2018', tier: 'year±1', sampleSize: 12, mileageAware: false },
  fairValueBase: 15500,
  fairValueAdjusted: 16000,
  mileageAdjustment: 500,
  discountPct: result.discountPct,
  raw: result.raw,
  confidence: result.confidence,
  penalty: result.penalty,
  score: result.score,
  priceCore: result.priceCore,
  total100: result.total100,
  factors: [],
  firedFlags: [{ code: 'desc_needs_repair', source: 'description' }],
  redFlags: result.redFlags,
  reason: result.reason,
  isOpportunity: result.isOpportunity,
  disqualified: result.disqualified,
};

/** Mirrors the formatter's label map, so a copy change has to be made deliberately in both places. */
const CONFIDENCE_LABELS: Record<string, string> = {
  vin_checked: 'перевірка VIN джерелом',
  vin_report: 'VIN-звіт',
  cohort_sample: 'обсяг вибірки порівнянних',
  cohort_tier: 'схожість когорти',
  drivetrain_fields: 'технічні поля авто',
  description: 'опис продавця',
  mileage_plausible: 'правдоподібність пробігу',
};

/** `⚠️ Ризики` carries a variation selector, so it never collides with a bare `⚠` reason sign. */
function countReasonLines(msg: string): number {
  return msg.split('\n').filter((l) => l.startsWith('✓ ') || l.startsWith('⚠ ')).length;
}

describe('formatWhy', () => {
  it('explains the score breakdown and surfaces description-derived risks', () => {
    const msg = formatWhy(detail, result, {
      fairValue: 16000,
      currency: Currency.USD,
      sampleSize: 12,
      benchmarkBase: 16000,
      mileageAware: true,
    });

    expect(msg).toContain('Чому такий бал');
    expect(msg).toContain('знижка 25%');
    expect(msg).toContain('Розклад балу: знижка → raw 0.83 × впевненість 0.9 × штраф 0.9 = 0.75');
    expect(msg).toContain('опис:');
    expect(msg).toContain('потребує ремонту');
  });

  it('shows the mileage correction when the cohort is not mileage-aware', () => {
    const msg = formatWhy(detail, result, {
      fairValue: 16000,
      currency: Currency.USD,
      sampleSize: 12,
      benchmarkBase: 15500,
      mileageAware: false,
    });

    expect(msg).toContain('Поправка на пробіг');
  });

  it('renders a persisted explanation snapshot with provenance', () => {
    const msg = formatStoredWhy(baseStored, {
      id: 'evidence-1',
      status: 'available',
      estimateAmount: 5000,
      currency: Currency.USD,
      queryMode: 'omni_id',
      policyKey: 'ai-shadow-v1',
      adapterVersion: 'auto-ria-ai-v1',
      comparability: 'review',
      comparabilityReasons: ['legacy_delta_at_least_20_pct'],
      sourceCapturedAt: new Date('2026-08-02T03:10:15.000Z'),
      providerStatistics: {
        minimum: { amount: 4882, currency: Currency.USD },
        maximum: { amount: 5395, currency: Currency.USD },
      },
      legacyReference: { providerDeltaPct: -26.74 },
    } as unknown as ValuationEvidence);

    expect(msg).toContain('Чому такий бал');
    expect(msg).toContain('Параметри: ParameterSet v3, поріг 0.63');
    expect(msg).toContain('Поправка на пробіг: +500 USD');
    expect(msg).toContain('опис: потребує ремонту');
    expect(msg).toContain('AUTO.RIA AI');
    expect(msg).toContain('не підтверджена ціна продажу');
    expect(msg).not.toContain('Рџ');
  });
});

/**
 * Assessment confidence in `/why` (spec 006 US6.1, T012). Every case below is built from a plain
 * persisted object: nothing here constructs a source, a repository, or the valuation service, which
 * is the structural proof of SC-005's zero source calls.
 */
describe('formatStoredWhy — assessment confidence', () => {
  const storedV3 = (
    assessmentConfidence: AssessmentConfidence | null | undefined,
  ): EvaluationExplanation => ({
    ...baseStored,
    schemaVersion: 3,
    assessmentConfidence,
  });

  const fullEvidence: AssessmentConfidence = {
    percent: 100,
    floored: false,
    inputs: [
      { key: 'vin_checked', present: true, weight: 20, contribution: 20 },
      { key: 'vin_report', present: true, weight: 15, contribution: 15 },
      { key: 'cohort_sample', present: true, weight: 20, contribution: 20 },
      { key: 'cohort_tier', present: true, weight: 10, contribution: 10 },
      { key: 'drivetrain_fields', present: true, weight: 15, contribution: 15 },
      { key: 'description', present: true, weight: 10, contribution: 10 },
      { key: 'mileage_plausible', present: true, weight: 10, contribution: 10 },
    ],
    reasons: [
      { key: 'vin_checked', sign: '✓', text: 'VIN independently checked by the source' },
      { key: 'vin_report', sign: '✓', text: 'a full VIN report is available' },
      { key: 'cohort_sample', sign: '✓', text: 'fair value backed by a full comparable cohort' },
      { key: 'cohort_tier', sign: '✓', text: 'comparables matched on mileage as well as make/model/year' },
      { key: 'drivetrain_fields', sign: '✓', text: 'gearbox, engine, body, fuel and generation all present' },
      { key: 'description', sign: '✓', text: 'a specific seller description with concrete details' },
      { key: 'mileage_plausible', sign: '✓', text: 'claimed mileage is consistent with the segment expectation' },
    ],
  };

  const zeroEvidence: AssessmentConfidence = {
    percent: 10,
    floored: true,
    inputs: fullEvidence.inputs.map((i) => ({ ...i, present: false, contribution: 0 })),
    reasons: [
      { key: 'vin_checked', sign: '⚠', text: 'no independent VIN check — claimed history and mileage are unverified' },
      { key: 'vin_report', sign: '⚠', text: 'no VIN report available' },
      { key: 'cohort_sample', sign: '⚠', text: 'no comparable cohort resolved — the fair value has no sample behind it' },
      { key: 'cohort_tier', sign: '⚠', text: 'no cohort tier resolved' },
      { key: 'drivetrain_fields', sign: '⚠', text: 'missing vehicle fields: gearbox, engine, body, fuel, generation' },
      { key: 'description', sign: '⚠', text: 'no seller description' },
      { key: 'mileage_plausible', sign: '⚠', text: 'mileage or model year missing — plausibility could not be checked' },
    ],
  };

  it('renders every reason with its sign for a fully evidenced listing', () => {
    const msg = formatStoredWhy(storedV3(fullEvidence));

    expect(msg).toContain('🧭 Впевненість оцінки: 100%');
    // The whole point of /why over the alert: all seven, not the top few.
    for (const reason of fullEvidence.reasons) {
      expect(msg).toContain(`✓ ${CONFIDENCE_LABELS[reason.key]}: ${reason.text}`);
    }
    expect(countReasonLines(msg)).toBe(7);
    expect(msg).toContain('(внесок 20 з 20)');
    expect(msg).not.toContain('нижню межу');
  });

  it('renders every deduction as a ⚠ reason naming its input, and says the floor was applied', () => {
    const msg = formatStoredWhy(storedV3(zeroEvidence));

    expect(msg).toContain('🧭 Впевненість оцінки: 10%');
    expect(msg).toContain('Доказів практично немає — показано нижню межу шкали');
    for (const reason of zeroEvidence.reasons) {
      expect(msg).toContain(`⚠ ${CONFIDENCE_LABELS[reason.key]}: ${reason.text}`);
    }
    expect(countReasonLines(msg)).toBe(7);
    expect(msg).toContain('(внесок 0 з 20)');
  });

  it('never presents confidence as part of the score, the threshold, or the alert decision', () => {
    const msg = formatStoredWhy(storedV3(fullEvidence));

    // The score breakdown line must still be the price-core confidence, untouched by this measure.
    expect(msg).toContain('Розклад балу: знижка → raw 0.83 × впевненість 0.9 × штраф 0.9 = 0.75');
    expect(msg).toContain('на бал, поріг і рішення про сповіщення вона не впливає');
    expect(msg).toContain('📊 Загальний бал: 88/100');
  });

  it('pairs each reason with exactly one input even if the persisted order differs', () => {
    const shuffled: AssessmentConfidence = {
      ...fullEvidence,
      inputs: [...fullEvidence.inputs].reverse(),
    };
    const msg = formatStoredWhy(storedV3(shuffled));

    expect(msg).toContain('✓ VIN-звіт: a full VIN report is available (внесок 15 з 15)');
    expect(msg).toContain('✓ опис продавця: a specific seller description with concrete details (внесок 10 з 10)');
  });

  it('says a V1 record predates the measure, without implying anything is broken', () => {
    const msg = formatStoredWhy(baseStored);

    expect(msg).toContain('не рахувалася — знімок зроблено до появи цієї метрики (схема v1)');
    expect(msg).not.toContain('не вдався');
    expect(countReasonLines(msg)).toBe(0);
  });

  it('reports a V3 record with no confidence as not measured, naming both possible causes', () => {
    // The swallowed-error case (AS-4) and the no-confidenceWeights case are indistinguishable in
    // the persisted record, so the copy must not assert either one specifically.
    for (const absent of [null, undefined]) {
      const msg = formatStoredWhy(storedV3(absent));

      expect(msg).toContain('не вимірювалася для цього знімка');
      expect(msg).toContain('не мав ваг або розрахунок не вдався');
      expect(msg).toContain('На бал і поріг це не впливає');
      expect(countReasonLines(msg)).toBe(0);
    }
  });

  it('falls back to the raw key rather than dropping a reason it has no label for', () => {
    const msg = formatStoredWhy(
      storedV3({
        percent: 42,
        floored: false,
        inputs: [{ key: 'future_input' as ConfidenceInputKey, present: false, weight: 5, contribution: 1 }],
        reasons: [{ key: 'future_input' as ConfidenceInputKey, sign: '⚠', text: 'something new' }],
      }),
    );

    expect(msg).toContain('⚠ future_input: something new (внесок 1 з 5)');
  });
});
