/**
 * Spec 018 T007 — the exit condition for phase 2 (SC-001).
 *
 * Shadow recording must be **observationally free**: with the accident-severity lexicon loaded, the
 * scoring outputs and the alert decision are bit-for-bit identical to a run without it. The verdict
 * is recorded and nothing else.
 *
 * The lever is the `HeuristicTablesService` stub — the same one `scoring-pipeline.spec.ts` uses.
 * One instance returns `{}` (classifier off, i.e. the pre-018 world), the other returns the **real**
 * lexicon read from `config/heuristics/accident-severity.json`. Every case in the labelled corpus is
 * run through both and the scoring projection compared with `toEqual`.
 *
 * No Jest snapshots — the repo has none, and a snapshot would record whatever the code does rather
 * than assert the property.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildSeedParams,
  ParametersService,
} from '../../src/modules/calibration/parameters.service';
import { AccidentSeverityLexicon } from '../../src/modules/valuation/accident-severity';
import {
  HeuristicTables,
  HeuristicTablesService,
} from '../../src/modules/valuation/factors/tables';
import {
  ValuationInput,
  ValuationResult,
  ValuationService,
} from '../../src/modules/valuation/valuation.service';
import { ACCIDENT_CORPUS } from '../fixtures/accident-corpus';

const params = {
  params: () => buildSeedParams({ mileageAnnualK: 15, mileagePer10kPct: 2, mileageMaxAdjPct: 20 }),
} as unknown as ParametersService;

const lexicon = JSON.parse(
  readFileSync(join(process.cwd(), 'config', 'heuristics', 'accident-severity.json'), 'utf8'),
) as AccidentSeverityLexicon;

const tablesOf = (t: HeuristicTables) => ({ get: () => t }) as unknown as HeuristicTablesService;

/** The pre-018 world: no accident lexicon, so the classifier cannot run at all. */
const shadowOff = new ValuationService(params, tablesOf({}));
/** Phase 2: the lexicon is loaded and the verdict is computed on every evaluation. */
const shadowOn = new ValuationService(params, tablesOf({ accidentSeverity: lexicon }));

/**
 * Everything that can reach the operator: the score chain, the alert decision, and the red-flag set
 * that drives it. `accidentSeverity` is deliberately excluded — it is the one field allowed to
 * differ, and asserting on it is `accident-severity.spec.ts`'s job.
 */
function scoringProjection(r: ValuationResult) {
  return {
    isOpportunity: r.isOpportunity,
    disqualified: r.disqualified,
    score: r.score,
    priceCore: r.priceCore,
    total100: r.total100,
    raw: r.raw,
    penalty: r.penalty,
    confidence: r.confidence,
    discountPct: r.discountPct,
    redFlags: r.redFlags,
    reason: r.reason,
    factors: r.factors,
  };
}

/** A discount deep enough that the case would alert if the clamp ever released it. */
function inputFor(overrides: Partial<ValuationInput>): ValuationInput {
  return {
    asking: 11000,
    fairValue: 16000,
    sampleSize: 50,
    minSamples: 10,
    minScore: 0.63,
    sellerType: 'private',
    hasVinReport: false,
    ...overrides,
  };
}

describe('spec 018 phase 2 — shadow recording changes nothing observable (SC-001)', () => {
  describe.each(ACCIDENT_CORPUS.map((c) => [c.note, c] as const))('%s', (_note, c) => {
    const input = inputFor({
      description: c.description,
      damaged: c.damaged,
      salvage: c.salvage,
      vinChecked: c.vinChecked,
      hasVinReport: c.hasVinReport ?? false,
    });

    it('scores identically with the lexicon loaded and absent', () => {
      expect(scoringProjection(shadowOn.evaluate(input))).toEqual(
        scoringProjection(shadowOff.evaluate(input)),
      );
    });
  });

  // The corpus is accident-shaped by construction. These cover the rest of the decision surface —
  // a clean opportunity, a thin-data listing, and an overpriced one — so the equality is not an
  // artefact of every case being disqualified anyway.
  describe.each([
    ['clean below-market opportunity', inputFor({ description: 'Один власник, гаражне зберігання' })],
    ['thin comparable data', inputFor({ sampleSize: 3 })],
    ['overpriced', inputFor({ asking: 18000 })],
    ['no description at all', inputFor({})],
  ])('%s', (_label, input) => {
    it('scores identically with the lexicon loaded and absent', () => {
      expect(scoringProjection(shadowOn.evaluate(input))).toEqual(
        scoringProjection(shadowOff.evaluate(input)),
      );
    });
  });

  it('still records a verdict when the lexicon is loaded (the shadow signal is not simply empty)', () => {
    const withVerdicts = ACCIDENT_CORPUS.filter((c) => c.expected !== null).map((c) =>
      shadowOn.evaluate(
        inputFor({
          description: c.description,
          damaged: c.damaged,
          salvage: c.salvage,
          vinChecked: c.vinChecked,
          hasVinReport: c.hasVinReport ?? false,
        }),
      ),
    );
    expect(withVerdicts.length).toBeGreaterThan(0);
    expect(withVerdicts.every((r) => r.accidentSeverity !== null)).toBe(true);
  });

  it('records nothing when the lexicon is absent, so pre-018 records are unaffected', () => {
    const anyAccident = shadowOff.evaluate(inputFor({ description: 'Авто тотал', damaged: true }));
    expect(anyAccident.accidentSeverity).toBeNull();
  });
});
