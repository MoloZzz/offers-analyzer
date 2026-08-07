/**
 * SPEC-017 T033 — contradictions are displayed, never resolved (FR-011, ADR-0019 §7).
 *
 * Two properties matter here and they pull in opposite directions. The detector must **fire** when
 * the model and the curated table genuinely disagree — otherwise the feature's whole premise (the
 * tables will never cover the long tail) goes unreported. And it must **not** fire on manufactured
 * disagreements, because a warning that cries wolf is how an operator learns to skip the section.
 */
import { detectRepairRiskContradiction } from '../../src/modules/analysis/analysis-contradiction';
import { AnalysisOutput, AnalysisWarningSeverity } from '../../src/modules/analysis/analysis.types';
import { RepairRiskTable } from '../../src/modules/valuation/factors/tables';

const TABLE: RepairRiskTable = {
  version: '2026-07-19',
  models: { 'toyota|corolla': 'LOW', 'volkswagen|touareg': 'HIGH' },
  makes: { lexus: 'LOW' },
  patterns: [
    { tier: 'HIGH', gearbox: ['dsg'], reason: 'DSG — дорогий ремонт мехатроніка' },
  ],
};

function output(severities: AnalysisWarningSeverity[]): AnalysisOutput {
  return {
    warnings: severities.map((severity, i) => ({
      code: `risk_${i}`,
      severity,
      rationale: `Причина ${i}`,
    })),
    inspectionChecklist: [],
    sellerQuestions: [],
    advisoryScore: 5,
    advisoryScoreRationale: 'r',
    reliabilityNotes: [],
  };
}

const detect = (make: string, model: string, out: AnalysisOutput, table: RepairRiskTable = TABLE) =>
  detectRepairRiskContradiction({ make, model, year: 2017, output: out, table });

describe('SPEC-017 contradiction — the model sees more risk than the table', () => {
  it('flags a high-severity warning against a curated LOW tier', () => {
    const result = detect('Toyota', 'Corolla', output(['high', 'low']));

    expect(result?.kind).toBe('model_more_severe');
    expect(result?.curatedTier).toBe('LOW');
    expect(result?.curatedVia).toBe('model');
    expect(result?.tableVersion).toBe('2026-07-19');
    expect(result?.modelSeverity).toBe('high');
  });

  it('carries only the warnings that drive the disagreement, verbatim', () => {
    const result = detect('Toyota', 'Corolla', output(['high', 'low', 'high']));

    expect(result?.modelWarnings.map((w) => w.code)).toEqual(['risk_0', 'risk_2']);
    expect(result?.modelWarnings[0].rationale).toBe('Причина 0');
  });

  it('resolves a curated LOW through the make-level entry too', () => {
    const result = detect('Lexus', 'RX 350', output(['high']));

    expect(result?.kind).toBe('model_more_severe');
    expect(result?.curatedVia).toBe('make');
  });

  it('does not fire when the model stays at medium against a curated LOW', () => {
    expect(detect('Toyota', 'Corolla', output(['medium', 'low']))).toBeNull();
  });
});

describe('SPEC-017 contradiction — the table sees more risk than the model', () => {
  it('flags a curated HIGH tier when the model raised nothing', () => {
    const result = detect('Volkswagen', 'Touareg', output([]));

    expect(result?.kind).toBe('model_less_severe');
    expect(result?.curatedTier).toBe('HIGH');
    expect(result?.modelSeverity).toBeNull();
    expect(result?.modelWarnings).toEqual([]);
  });

  it('flags a curated HIGH tier when the model raised only low-severity warnings', () => {
    const result = detect('Volkswagen', 'Touareg', output(['low', 'low']));

    expect(result?.kind).toBe('model_less_severe');
    expect(result?.modelWarnings).toHaveLength(2);
  });

  it('does not fire when the model agrees the risk is high', () => {
    expect(detect('Volkswagen', 'Touareg', output(['high']))).toBeNull();
  });

  it('does not fire on a medium warning against a curated HIGH — that is agreement enough', () => {
    expect(detect('Volkswagen', 'Touareg', output(['medium']))).toBeNull();
  });
});

describe('SPEC-017 contradiction — silence rather than invention', () => {
  it('says nothing when the curated table has no entry for the listing', () => {
    expect(detect('Peugeot', '308', output(['high']))).toBeNull();
  });

  it('says nothing when no curated table is loaded at all', () => {
    // Called directly: passing `undefined` through the helper would hit its default parameter.
    expect(
      detectRepairRiskContradiction({
        make: 'Toyota',
        model: 'Corolla',
        year: 2017,
        output: output(['high']),
      }),
    ).toBeNull();
  });

  it('says nothing about a MEDIUM tier — a mid-vs-mid disagreement is noise, not signal', () => {
    const midTable: RepairRiskTable = { ...TABLE, models: { 'toyota|corolla': 'MEDIUM' } };

    expect(detect('Toyota', 'Corolla', output(['high']), midTable)).toBeNull();
  });

  it('never returns anything that could be written back — it reports, and the table is untouched', () => {
    const before = JSON.stringify(TABLE);

    detect('Toyota', 'Corolla', output(['high']));
    detect('Volkswagen', 'Touareg', output([]));

    expect(JSON.stringify(TABLE)).toBe(before);
  });
});
