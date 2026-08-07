/**
 * SPEC-017 T008 — the non-influence guard (SC-001, FR-002). **Exit condition for every phase.**
 *
 * The claim is the strongest one the spec makes: advisory output cannot move a score in either
 * direction. So the test does not inspect the analysis code — it compares two runs of the *scorer*
 * over the full corpus, one in a module registry where `analysis` was never loaded, one where the
 * whole analysis path (context assembly, validation) has been exercised on every case first.
 *
 * `jest.isolateModules` gives a genuinely separate registry per run, which is what makes "loaded and
 * unloaded" a real comparison rather than a figure of speech. Re-run this after every phase; a
 * failure here means the boundary broke, whatever else passes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildSeedParams, ParametersService } from '../../src/modules/calibration/parameters.service';
import { AccidentSeverityLexicon } from '../../src/modules/valuation/accident-severity';
import { HeuristicTables, HeuristicTablesService } from '../../src/modules/valuation/factors/tables';
import type { ValuationInput, ValuationResult } from '../../src/modules/valuation/valuation.service';
import { ACCIDENT_CORPUS } from '../fixtures/accident-corpus';

const lexicon = JSON.parse(
  readFileSync(join(process.cwd(), 'config', 'heuristics', 'accident-severity.json'), 'utf8'),
) as AccidentSeverityLexicon;

const params = {
  params: () => buildSeedParams({ mileageAnnualK: 15, mileagePer10kPct: 2, mileageMaxAdjPct: 20 }),
} as unknown as ParametersService;
const tablesOf = (t: HeuristicTables) => ({ get: () => t }) as unknown as HeuristicTablesService;

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

/** Every case the scorer sees, including non-accident shapes so equality is not an artefact. */
const CASES: Array<readonly [string, ValuationInput]> = [
  ...ACCIDENT_CORPUS.map(
    (c) =>
      [
        c.note,
        inputFor({
          description: c.description,
          damaged: c.damaged,
          salvage: c.salvage,
          vinChecked: c.vinChecked,
          hasVinReport: c.hasVinReport ?? false,
        }),
      ] as const,
  ),
  ['clean below-market opportunity', inputFor({ description: 'Один власник, гаражне зберігання' })],
  ['thin comparable data', inputFor({ sampleSize: 3 })],
  ['overpriced', inputFor({ asking: 18000 })],
  ['no description at all', inputFor({})],
];

/** Everything that can reach the operator: the score chain and the alert decision. */
function projection(result: ValuationResult) {
  return {
    score: result.score,
    priceCore: result.priceCore,
    total100: result.total100,
    isOpportunity: result.isOpportunity,
    disqualified: result.disqualified,
    raw: result.raw,
    penalty: result.penalty,
    confidence: result.confidence,
    discountPct: result.discountPct,
    redFlags: result.redFlags,
    reason: result.reason,
    factors: result.factors,
  };
}

type Run = { projections: ReturnType<typeof projection>[]; alertSet: string[] };

function scoreCorpus(withAnalysisLoaded: boolean): Run {
  let run: Run | undefined;
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
    if (withAnalysisLoaded) {
      const { buildAnalysisContext } =
        require('../../src/modules/analysis/analysis-context') as typeof import('../../src/modules/analysis/analysis-context');
      const { validateAnalysisOutput } =
        require('../../src/modules/analysis/analysis-output') as typeof import('../../src/modules/analysis/analysis-output');
      const { ANALYSIS_V1_POLICY } =
        require('../../src/modules/analysis/analysis-policy') as typeof import('../../src/modules/analysis/analysis-policy');

      // Exercise the full advisory path on every case *before* scoring: assemble the context from
      // the same description the scorer will read, and validate a model answer that shouts the
      // opposite of whatever the scorer will conclude.
      for (const [note, input] of CASES) {
        buildAnalysisContext({
          listing: {
            externalId: note,
            make: 'Volkswagen',
            model: 'Passat',
            year: 2017,
            mileageK: 180,
            sellerType: input.sellerType,
            vinPresent: input.hasVinReport ?? false,
            url: `https://auto.ria.com/uk/${note}`,
            askingAmount: input.asking,
            currency: 'USD',
            description: input.description ?? null,
          },
          explanation: null,
          policy: ANALYSIS_V1_POLICY,
        });
        validateAnalysisOutput(
          {
            warnings: [{ code: 'total_loss', severity: 'high', rationale: 'Модель вважає авто небезпечним.' }],
            inspectionChecklist: ['Перевірити геометрію кузова'],
            sellerQuestions: ['Чи були ДТП?'],
            advisoryScore: 0,
            advisoryScoreRationale: 'Модель радить не купувати.',
            reliabilityNotes: [],
          },
          ANALYSIS_V1_POLICY,
        );
      }
    }

    const { ValuationService } =
      require('../../src/modules/valuation/valuation.service') as typeof import('../../src/modules/valuation/valuation.service');
    /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

    const service = new ValuationService(params, tablesOf({ accidentSeverity: lexicon }));
    const results = CASES.map(([, input]) => service.evaluate(input));
    run = {
      projections: results.map(projection),
      alertSet: CASES.filter((_, i) => results[i].isOpportunity).map(([note]) => note),
    };
  });
  if (!run) throw new Error('isolated run produced no result');
  return run;
}

describe('SPEC-017 non-influence guard (SC-001, FR-002)', () => {
  const withAnalysis = scoreCorpus(true);
  const withoutAnalysis = scoreCorpus(false);

  it('scores bit-for-bit identically with the analysis module loaded and unloaded', () => {
    expect(withAnalysis.projections).toEqual(withoutAnalysis.projections);
  });

  it('produces the identical alert set', () => {
    expect(withAnalysis.alertSet).toEqual(withoutAnalysis.alertSet);
  });

  it('the corpus is not vacuous — it contains both alerting and non-alerting cases', () => {
    expect(withoutAnalysis.alertSet.length).toBeGreaterThan(0);
    expect(withoutAnalysis.alertSet.length).toBeLessThan(CASES.length);
  });
});
