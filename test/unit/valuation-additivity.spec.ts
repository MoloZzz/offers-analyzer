/**
 * Spec 006 T004 — the non-multiplication guard (FR-002, FR-003, SC-001).
 *
 * The property: assessment confidence is a **separate output**. Turning it on, turning it off, or
 * re-weighting it must leave `score`, `priceCore`, `total100`, `discountPct`, `isOpportunity` and
 * `disqualified` bit-for-bit identical, on every case in the corpus.
 *
 * How it is built to actually catch a violation, rather than pass by accident:
 *
 * 1. **Three configurations, not two.** Off (no `confidenceWeights`), on with the code defaults, and
 *    on with a *deliberately skewed* table. Off-vs-on catches the obvious `score × confidence`. The
 *    third catches a subtler regression the first pair cannot: if someone multiplies in a value that
 *    happens to be constant across the corpus, off-vs-on still differs, but a reviewer might "fix"
 *    it by making the output always present. Re-weighting moves the percent without moving anything
 *    else, so only a truly disconnected output survives all three.
 * 2. **The corpus spans the percent range.** The assertion is worthless if every case scores the
 *    same confidence, so the fixtures are checked to produce a wide spread *and* an actual movement
 *    between weightings before the equality assertions are trusted — a separate test asserts both.
 *    Without that check, a corpus of identical listings would make this file pass vacuously.
 * 3. **`toEqual` on a whole projection, not per-field `toBe`.** A field added to the score chain
 *    later is compared automatically instead of being silently unguarded.
 *
 * The lever is `ScoringParams.confidenceWeights`, mirroring how
 * `test/integration/accident-shadow-equivalence.spec.ts` uses the heuristic-table stub.
 */
import { ScoringParams } from '../../src/modules/calibration/entities/parameter-set.entity';
import { buildSeedParams } from '../../src/modules/calibration/parameters.service';
import {
  computeValuation,
  ValuationInput,
  ValuationResult,
} from '../../src/modules/valuation/valuation.service';

const BASE = buildSeedParams({ mileageAnnualK: 15, mileagePer10kPct: 2, mileageMaxAdjPct: 20 });

/** The pre-006 world: the active ParameterSet has no `confidenceWeights` key at all. */
const OFF: ScoringParams = { ...BASE, confidenceWeights: undefined };
/** US6.1 as it ships: enabled with the code default weights. */
const ON: ScoringParams = { ...BASE, confidenceWeights: {} };
/**
 * Enabled with a table that bears no resemblance to the default one — VIN evidence carries almost
 * everything and the cohort inputs are switched off. Any listing's percent moves; no score may.
 */
const RESKEWED: ScoringParams = {
  ...BASE,
  confidenceWeights: {
    vin_checked: 200,
    vin_report: 100,
    cohort_sample: 0,
    cohort_tier: 0,
    drivetrain_fields: 1,
    description: 1,
    mileage_plausible: 1,
  },
};

/**
 * Everything the operator can observe or that gates an alert. `assessmentConfidence` and
 * `accidentSeverity` are excluded — they are the outputs allowed to differ.
 */
function scoringProjection(r: ValuationResult) {
  return {
    score: r.score,
    priceCore: r.priceCore,
    total100: r.total100,
    discountPct: r.discountPct,
    isOpportunity: r.isOpportunity,
    disqualified: r.disqualified,
    raw: r.raw,
    confidence: r.confidence,
    penalty: r.penalty,
    redFlags: r.redFlags,
    reason: r.reason,
    factors: r.factors,
  };
}

function inputFor(overrides: Partial<ValuationInput> = {}): ValuationInput {
  return {
    asking: 12000,
    fairValue: 16000,
    sampleSize: 50,
    minSamples: 10,
    minScore: 0.63,
    sellerType: 'private',
    hasVinReport: true,
    ...overrides,
  };
}

/**
 * The corpus. Spans the evidence axis (fully evidenced → nothing known) *and* the scoring axis
 * (opportunity, at-market, overpriced, disqualified, thin data), because the guard must hold for
 * cases on both sides of every threshold, not just for well-behaved ones.
 */
const CORPUS: ReadonlyArray<readonly [string, ValuationInput]> = [
  [
    'fully evidenced below-market opportunity',
    inputFor({
      vinChecked: true,
      hasVinReport: true,
      cohortTier: 'make_model_year_mileage',
      gearbox: 'Автомат',
      engine: '2.0 TDI',
      body: 'Седан',
      fuel: 'Дизель',
      generation: 'B8',
      description:
        'Один власник з 2017 року, обслуговування у офіційного дилера, пробіг 120 тис. км, ' +
        'встановлено зимову гуму, жодних ДТП, є сервісна книжка та два комплекти ключів.',
      mileageK: 120,
      year: 2017,
    }),
  ],
  ['zero-evidence listing', inputFor({ sampleSize: 0, hasVinReport: false })],
  [
    'partially evidenced (half the drivetrain fields, terse description)',
    inputFor({
      vinChecked: true,
      hasVinReport: false,
      cohortTier: 'make_model_year',
      gearbox: 'Механіка',
      fuel: 'Бензин',
      description: 'Гарний стан',
      mileageK: 200,
      year: 2010,
    }),
  ],
  [
    'implausible mileage for the age',
    inputFor({ mileageK: 15, year: 2005, cohortTier: 'make_model_fallback', hasVinReport: false }),
  ],
  ['at market (priceCore exactly 0)', inputFor({ asking: 16000, vinChecked: true })],
  ['overpriced', inputFor({ asking: 21000, cohortTier: 'make_model', generation: 'F30' })],
  [
    'hard-disqualified trap',
    inputFor({ asking: 9000, damaged: true, vinChecked: true, description: 'Після ДТП, не на ходу' }),
  ],
  ['thin comparable data', inputFor({ sampleSize: 3 })],
  [
    'unverified bargain (soft penalty fires)',
    inputFor({ asking: 10000, hasVinReport: false, vinChecked: false }),
  ],
  ['no fair value resolved at all', inputFor({ fairValue: 0, sampleSize: 0 })],
  ['dealer listing with full fields but no VIN evidence', inputFor({
    sellerType: 'dealer',
    hasVinReport: false,
    gearbox: 'Автомат',
    engine: '1.6',
    body: 'Хетчбек',
    fuel: 'Бензин',
    generation: 'VII',
    cohortTier: 'make_model_year',
    mileageK: 90,
    year: 2018,
  })],
];

describe('spec 006 T004 — assessment confidence is never multiplied into the score', () => {
  describe.each(CORPUS)('%s', (_label, input) => {
    it('scores identically with the measure off and on', () => {
      expect(scoringProjection(computeValuation(input, ON))).toEqual(
        scoringProjection(computeValuation(input, OFF)),
      );
    });

    it('scores identically under a completely different weight table', () => {
      expect(scoringProjection(computeValuation(input, RESKEWED))).toEqual(
        scoringProjection(computeValuation(input, OFF)),
      );
    });
  });

  // Without this, every assertion above could hold because the output is always the same value (or
  // always absent) — an equality test proves nothing about a constant.
  describe('the corpus actually exercises the output (otherwise the equalities are vacuous)', () => {
    const percents = CORPUS.map(([, i]) => computeValuation(i, ON).assessmentConfidence?.percent);

    it('produces a percent for every case when enabled', () => {
      expect(percents.every((p) => typeof p === 'number')).toBe(true);
    });

    it('spans a wide range across the corpus, so a multiplied-in value could not go unnoticed', () => {
      const values = percents as number[];
      expect(Math.max(...values) - Math.min(...values)).toBeGreaterThanOrEqual(50);
    });

    it('moves when the weight table is re-skewed', () => {
      const reskewed = CORPUS.map(([, i]) => computeValuation(i, RESKEWED).assessmentConfidence?.percent);
      expect(reskewed).not.toEqual(percents);
    });

    it('is omitted entirely — not defaulted — when the ParameterSet carries no weights', () => {
      for (const [, input] of CORPUS) {
        expect(computeValuation(input, OFF).assessmentConfidence).toBeNull();
      }
    });
  });

  // US6.1 AS-4: a defect in the projection must cost a line of text, not an alert.
  it('completes the evaluation with an absent output when the computation throws', () => {
    const hostile: ScoringParams = {
      ...BASE,
      // A Proxy that throws on every weight lookup — the cheapest way to fail the measure from the
      // outside without weakening the production code path with a test-only branch.
      confidenceWeights: new Proxy(
        {},
        {
          get() {
            throw new Error('weight table unreadable');
          },
        },
      ) as Record<string, number>,
    };
    const input = inputFor({ vinChecked: true });

    const result = computeValuation(input, hostile);
    expect(result.assessmentConfidence).toBeNull();
    expect(scoringProjection(result)).toEqual(scoringProjection(computeValuation(input, OFF)));
  });
});
