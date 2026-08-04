/**
 * Spec 006 US6.1 / T006 — assessment confidence (ADR-0018).
 *
 * The measure is pure, so these tests are the specification of its behaviour. `now` is injected
 * everywhere the mileage expectation is exercised, exactly as `mileage-risk.spec.ts` does, so the
 * suite does not start failing on 1 January.
 */
import {
  AssessmentConfidenceInput,
  CONFIDENCE_FLOOR,
  computeAssessmentConfidence,
} from '../../src/modules/valuation/assessment-confidence';

const NOW = new Date('2026-08-04T12:00:00.000Z');

/** Everything present and consistent — the AS-3 case. */
function fullEvidence(overrides: Partial<AssessmentConfidenceInput> = {}): AssessmentConfidenceInput {
  return {
    vinChecked: true,
    hasVinReport: true,
    sampleSize: 50,
    minSamples: 10,
    cohortTier: 'make_model_year_mileage',
    gearbox: 'Автомат',
    engine: '2.0 TDI',
    body: 'Седан',
    fuel: 'Дизель',
    generation: 'B8',
    description:
      'Один власник з 2017 року, обслуговування у офіційного дилера, пробіг 120 тис. км, ' +
      'зимова гума в комплекті, сервісна книжка та два комплекти ключів.',
    mileageK: 135,
    year: 2017,
    mileageAnnualK: 15,
    now: NOW,
    ...overrides,
  };
}

/** Nothing known beyond the asking price — the AS-2 case. */
function zeroEvidence(overrides: Partial<AssessmentConfidenceInput> = {}): AssessmentConfidenceInput {
  return {
    vinChecked: false,
    hasVinReport: false,
    sampleSize: 0,
    minSamples: 10,
    mileageAnnualK: 15,
    now: NOW,
    ...overrides,
  };
}

describe('computeAssessmentConfidence', () => {
  describe('full evidence (US6.1 AS-3)', () => {
    const result = computeAssessmentConfidence(fullEvidence(), {});

    it('reports a high percent', () => {
      expect(result.percent).toBe(100);
      expect(result.floored).toBe(false);
    });

    it('marks every contribution with a ✓ reason', () => {
      expect(result.reasons.every((r) => r.sign === '✓')).toBe(true);
      expect(result.inputs.every((i) => i.present)).toBe(true);
    });

    it('records what each input contributed, not just the total', () => {
      const vin = result.inputs.find((i) => i.key === 'vin_checked');
      expect(vin).toMatchObject({ present: true, contribution: vin?.weight });
    });
  });

  describe('zero evidence (US6.1 AS-2, spec Edge Cases)', () => {
    const result = computeAssessmentConfidence(zeroEvidence(), {});

    it('reports the floor rather than a fabricated mid-range percentage', () => {
      expect(result.percent).toBe(CONFIDENCE_FLOOR);
      expect(result.floored).toBe(true);
    });

    it('lists every missing input as a ⚠ reason', () => {
      expect(result.reasons.every((r) => r.sign === '⚠')).toBe(true);
      expect(result.inputs.every((i) => i.contribution === 0)).toBe(true);
    });

    it('names the input behind every deduction (SC-002 — zero unexplained percentages)', () => {
      const named = result.reasons.map((r) => r.key).sort();
      expect(named).toEqual(result.inputs.map((i) => i.key).sort());
      expect(result.reasons.every((r) => r.text.trim().length > 0)).toBe(true);
    });

    it('writes every reason in Ukrainian, the language of every operator surface', () => {
      // The reason text is persisted and rendered verbatim in `/why`, so the weight table is the
      // only place this can be got right. An English sentence here surfaces as English inside a
      // Ukrainian message. Acronyms (VIN) are allowed; a run of lowercase Latin is not.
      for (const reason of result.reasons) {
        expect(reason.text).not.toMatch(/[a-z]{3,}/);
      }
    });

    it('names the individually missing vehicle fields, not just "fields missing"', () => {
      const drivetrain = result.reasons.find((r) => r.key === 'drivetrain_fields');
      for (const field of ['коробка передач', 'двигун', 'кузов', 'паливо', 'покоління']) {
        expect(drivetrain?.text).toContain(field);
      }
    });
  });

  describe('reason traceability (T006)', () => {
    const result = computeAssessmentConfidence(fullEvidence({ hasVinReport: false }), {});

    it('emits exactly one reason per input, in the same order', () => {
      expect(result.reasons).toHaveLength(result.inputs.length);
      expect(result.reasons.map((r) => r.key)).toEqual(result.inputs.map((i) => i.key));
    });

    it('has no duplicate keys, so a reason can never trace to two inputs', () => {
      expect(new Set(result.reasons.map((r) => r.key)).size).toBe(result.reasons.length);
    });

    it('signs the one missing input ⚠ and leaves the rest ✓', () => {
      expect(result.reasons.filter((r) => r.sign === '⚠').map((r) => r.key)).toEqual(['vin_report']);
    });
  });

  describe('the evidence gap (SC-003)', () => {
    it('separates a well-evidenced and a poorly-evidenced listing by ≥30 points', () => {
      const rich = computeAssessmentConfidence(fullEvidence(), {});
      const poor = computeAssessmentConfidence(zeroEvidence(), {});
      expect(rich.percent - poor.percent).toBeGreaterThanOrEqual(30);
    });

    it('still clears 30 points for a realistic middling pair, not only the extremes', () => {
      // Both are plausible real listings: a checked VIN with full fields versus the common case of
      // an unchecked private ad with a year-level cohort and a one-line description.
      const better = computeAssessmentConfidence(fullEvidence({ hasVinReport: false }), {});
      const worse = computeAssessmentConfidence(
        zeroEvidence({
          sampleSize: 8,
          cohortTier: 'make_model',
          gearbox: 'Механіка',
          description: 'Терміново',
        }),
        {},
      );
      expect(better.percent - worse.percent).toBeGreaterThanOrEqual(30);
    });
  });

  describe('partial coverage is graded, never rounded up to "present"', () => {
    it('credits some but not all of the drivetrain weight for three of five fields', () => {
      const result = computeAssessmentConfidence(
        fullEvidence({ body: undefined, generation: undefined }),
        {},
      );
      const drivetrain = result.inputs.find((i) => i.key === 'drivetrain_fields');
      expect(drivetrain?.present).toBe(false);
      expect(drivetrain?.contribution).toBeGreaterThan(0);
      expect(drivetrain?.contribution).toBeLessThan(drivetrain?.weight ?? 0);
    });

    it('credits a present-but-terse description less than a specific one', () => {
      const terse = computeAssessmentConfidence(fullEvidence({ description: 'Гарний стан' }), {});
      const specific = computeAssessmentConfidence(fullEvidence(), {});
      const of = (r: typeof terse) => r.inputs.find((i) => i.key === 'description')?.contribution ?? 0;
      expect(of(terse)).toBeGreaterThan(0);
      expect(of(terse)).toBeLessThan(of(specific));
    });

    it('grades the cohort tier by how like-for-like the comparables were', () => {
      const tierOf = (cohortTier?: string) =>
        computeAssessmentConfidence(fullEvidence({ cohortTier }), {}).inputs.find(
          (i) => i.key === 'cohort_tier',
        )?.contribution ?? 0;
      expect(tierOf('make_model_year_mileage')).toBeGreaterThan(tierOf('make_model_year'));
      expect(tierOf('make_model_year')).toBeGreaterThan(tierOf('make_model'));
      expect(tierOf(undefined)).toBe(0);
      // An unrecognized tier is unknown evidence, not partial evidence.
      expect(tierOf('some_future_tier')).toBe(0);
    });
  });

  describe('unknown inputs lower confidence and never raise it (US6.1)', () => {
    it('scores an absent mileage the same as an implausible one: zero credit', () => {
      const absent = computeAssessmentConfidence(
        fullEvidence({ mileageK: undefined, year: undefined }),
        {},
      );
      const implausible = computeAssessmentConfidence(
        fullEvidence({ mileageK: 15, year: 2005 }), // ~21 yrs old, 15k km
        {},
      );
      const of = (r: typeof absent) =>
        r.inputs.find((i) => i.key === 'mileage_plausible')?.contribution ?? 0;
      expect(of(absent)).toBe(0);
      expect(of(implausible)).toBe(0);
    });

    it('distinguishes "mileage not checkable" from "mileage implausible" in the reason text', () => {
      const absent = computeAssessmentConfidence(fullEvidence({ mileageK: undefined }), {});
      const implausible = computeAssessmentConfidence(fullEvidence({ mileageK: 15, year: 2005 }), {});
      const textOf = (r: typeof absent) =>
        r.reasons.find((x) => x.key === 'mileage_plausible')?.text ?? '';
      // "nothing to check it against" vs "checked and it looks wrong" — an operator must not read
      // a missing odometer as an implausible one.
      expect(textOf(absent)).toContain('бракує');
      expect(textOf(implausible)).not.toContain('бракує');
    });

    it('credits mileage that is plausibly off but not wildly so', () => {
      const of = (mileageK: number) =>
        computeAssessmentConfidence(fullEvidence({ mileageK, year: 2017 }), {}).inputs.find(
          (i) => i.key === 'mileage_plausible',
        )?.contribution ?? 0;
      expect(of(135)).toBeGreaterThan(of(60)); // 1.0x vs 0.44x of the expectation
      expect(of(60)).toBeGreaterThan(of(15));
    });
  });

  describe('ParameterSet weight overrides (FR-007)', () => {
    it('uses the override instead of the default weight', () => {
      const result = computeAssessmentConfidence(fullEvidence(), { vin_checked: 500 });
      expect(result.inputs.find((i) => i.key === 'vin_checked')?.weight).toBe(500);
    });

    it('treats an override of 0 as switching the input off, not as a missing override', () => {
      const off = computeAssessmentConfidence(zeroEvidence(), { vin_checked: 0, vin_report: 0 });
      expect(off.inputs.find((i) => i.key === 'vin_checked')?.weight).toBe(0);
      // With the two VIN inputs weightless, a listing missing them loses nothing for it.
      const on = computeAssessmentConfidence(zeroEvidence(), {});
      expect(off.percent).toBeGreaterThanOrEqual(on.percent);
    });

    it('ignores a nonsensical override rather than producing a nonsensical percent', () => {
      const result = computeAssessmentConfidence(fullEvidence(), {
        vin_checked: Number.NaN,
        vin_report: -10,
      });
      expect(result.percent).toBe(100);
      expect(result.inputs.every((i) => i.weight >= 0)).toBe(true);
    });

    it('reports the floor rather than dividing by zero when every weight is switched off', () => {
      const result = computeAssessmentConfidence(fullEvidence(), {
        vin_checked: 0,
        vin_report: 0,
        cohort_sample: 0,
        cohort_tier: 0,
        drivetrain_fields: 0,
        description: 0,
        mileage_plausible: 0,
      });
      expect(result.percent).toBe(CONFIDENCE_FLOOR);
    });

    it('keeps the percent bounded to 0–100 whatever the table says', () => {
      const result = computeAssessmentConfidence(fullEvidence(), { vin_checked: 10_000 });
      expect(result.percent).toBeLessThanOrEqual(100);
      expect(result.percent).toBeGreaterThanOrEqual(CONFIDENCE_FLOOR);
    });
  });

  describe('cohort sample size is one weighted input, not the price-core confidence', () => {
    it('grades it against the profile threshold', () => {
      const of = (sampleSize: number) =>
        computeAssessmentConfidence(fullEvidence({ sampleSize }), {}).inputs.find(
          (i) => i.key === 'cohort_sample',
        )?.contribution ?? 0;
      expect(of(0)).toBe(0);
      expect(of(20)).toBeGreaterThan(of(5));
      expect(of(50)).toBe(of(20)); // saturates at minSamples × 2, same shape as the score's term
    });

    it('names the shortfall in the reason', () => {
      const result = computeAssessmentConfidence(fullEvidence({ sampleSize: 5 }), {});
      expect(result.reasons.find((r) => r.key === 'cohort_sample')?.text).toContain('5');
    });
  });
});
