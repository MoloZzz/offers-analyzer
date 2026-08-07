import { resolveRepairRiskTier } from '../valuation/factors/repair-risk';
import { RepairRiskTable } from '../valuation/factors/tables';

import { AnalysisOutput, AnalysisWarningSeverity } from './analysis.types';

/**
 * SPEC-017 T033 — surface a disagreement between a model claim and a curated repair-risk entry
 * **without resolving it** (FR-011, ADR-0019 §7).
 *
 * The rule this module refuses to implement is "decide who is right". The curated table is edited
 * by a human with an audit trail; the model's answer is an unverified opinion. When they disagree,
 * the operator is the one with standing to judge — so both sides are shown, the conflict is named,
 * and nothing is written anywhere. There is deliberately **no code path from here into the curated
 * table**: this module imports the table's reader and its type, and nothing that writes.
 *
 * The comparison is asymmetric on purpose, because the two failure modes are not equally
 * interesting:
 *
 * - **`model_more_severe`** — the table says LOW, the model raises a high-severity warning. This is
 *   the case worth showing loudly: the curated tables cover a handful of patterns and were never
 *   going to cover the long tail, which is the whole reason this feature exists.
 * - **`model_less_severe`** — the table says HIGH and the model raises nothing above `low`. Worth
 *   showing because an operator who reads only the AI reply would otherwise miss a curated warning
 *   the system already had.
 *
 * MEDIUM is deliberately not compared: a mid tier disagreeing with a mid severity is noise, and
 * inventing a threshold there would manufacture conflicts rather than report them.
 */
export interface RepairRiskContradiction {
  kind: 'model_more_severe' | 'model_less_severe';
  curatedTier: 'LOW' | 'MEDIUM' | 'HIGH';
  curatedReason: string;
  curatedVia: 'model' | 'make' | 'pattern';
  tableVersion: string;
  /** Highest severity the model raised, or `null` when it raised no warnings at all. */
  modelSeverity: AnalysisWarningSeverity | null;
  /** The model warnings that drive the disagreement, verbatim. */
  modelWarnings: Array<{ code: string; severity: AnalysisWarningSeverity; rationale: string }>;
}

export interface ContradictionInput {
  make?: string;
  model?: string;
  year?: number;
  output: AnalysisOutput;
  table?: RepairRiskTable;
}

const RANK: Record<AnalysisWarningSeverity, number> = { low: 1, medium: 2, high: 3 };

export function detectRepairRiskContradiction(
  input: ContradictionInput,
): RepairRiskContradiction | null {
  if (!input.table) return null;

  // Only make/model resolution is available here: a stored `Listing` carries no engine, gearbox or
  // fuel, so pattern rules cannot be evaluated from persisted data. Resolving with what exists and
  // reporting nothing otherwise is the honest option — a fabricated tier would be worse than silence.
  const curated = resolveRepairRiskTier(
    { make: input.make, model: input.model, year: input.year },
    input.table,
  );
  if (!curated || curated.tier === 'MEDIUM') return null;

  const severity = highestSeverity(input.output);

  if (curated.tier === 'LOW' && severity === 'high') {
    return build('model_more_severe', curated, input, severity, (w) => w.severity === 'high');
  }
  if (curated.tier === 'HIGH' && (severity === null || RANK[severity] <= RANK.low)) {
    return build('model_less_severe', curated, input, severity, () => true);
  }
  return null;
}

function build(
  kind: RepairRiskContradiction['kind'],
  curated: NonNullable<ReturnType<typeof resolveRepairRiskTier>>,
  input: ContradictionInput,
  modelSeverity: AnalysisWarningSeverity | null,
  keep: (warning: AnalysisOutput['warnings'][number]) => boolean,
): RepairRiskContradiction {
  return {
    kind,
    curatedTier: curated.tier,
    curatedReason: curated.reason,
    curatedVia: curated.via,
    tableVersion: input.table?.version ?? 'unknown',
    modelSeverity,
    modelWarnings: input.output.warnings
      .filter(keep)
      .map(({ code, severity, rationale }) => ({ code, severity, rationale })),
  };
}

function highestSeverity(output: AnalysisOutput): AnalysisWarningSeverity | null {
  let best: AnalysisWarningSeverity | null = null;
  for (const warning of output.warnings) {
    if (best === null || RANK[warning.severity] > RANK[best]) best = warning.severity;
  }
  return best;
}
