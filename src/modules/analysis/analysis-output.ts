import { AnalysisPolicy, AnalysisPolicyRanges } from './analysis-policy';
import { AnalysisOutput, AnalysisWarning, AnalysisWarningSeverity } from './analysis.types';

/**
 * SPEC-017 T006 — strict, range-checked validation at the provider boundary (FR-004).
 *
 * **There is no repair pass and no partial value.** A half-parsed model answer is worse than none:
 * it renders as though the system stood behind it while carrying whatever survived the parse. So a
 * single violation anywhere discards the whole payload, and the caller persists a failed attempt.
 *
 * Range checks are part of validation, not a later sanity step — a schema-valid payload can still
 * be semantically absurd (a negative repair cost, a score of 900), and the boundary is the only
 * place that can reject it before it reaches a human as a formatted answer.
 */
export type AnalysisValidation =
  | { ok: true; value: AnalysisOutput }
  | { ok: false; violation: string };

const SEVERITIES: readonly AnalysisWarningSeverity[] = ['low', 'medium', 'high'];

export function validateAnalysisOutput(payload: unknown, policy: AnalysisPolicy): AnalysisValidation {
  const ranges = policy.ranges;
  if (!isRecord(payload)) return fail('payload is not an object');

  const warnings = validateWarnings(payload.warnings, ranges);
  if ('violation' in warnings) return warnings;

  const checklist = stringArray(
    payload.inspectionChecklist,
    'inspectionChecklist',
    ranges.maxChecklistItems,
    ranges,
  );
  if ('violation' in checklist) return checklist;

  const questions = stringArray(
    payload.sellerQuestions,
    'sellerQuestions',
    ranges.maxSellerQuestions,
    ranges,
  );
  if ('violation' in questions) return questions;

  // Reliability notes are optional: a model with nothing to say about a platform should say
  // nothing rather than be pushed into inventing something.
  const notes = stringArray(
    payload.reliabilityNotes ?? [],
    'reliabilityNotes',
    ranges.maxReliabilityNotes,
    ranges,
  );
  if ('violation' in notes) return notes;

  const advisoryScore = payload.advisoryScore;
  if (
    typeof advisoryScore !== 'number' ||
    !Number.isFinite(advisoryScore) ||
    advisoryScore < ranges.advisoryScoreMin ||
    advisoryScore > ranges.advisoryScoreMax
  ) {
    return fail('advisoryScore out of range');
  }

  const rationale = payload.advisoryScoreRationale;
  if (!isBoundedString(rationale, ranges)) return fail('advisoryScoreRationale invalid');

  return {
    ok: true,
    value: {
      warnings: warnings.value,
      inspectionChecklist: checklist.value,
      sellerQuestions: questions.value,
      advisoryScore,
      advisoryScoreRationale: rationale,
      reliabilityNotes: notes.value,
    },
  };
}

function validateWarnings(
  value: unknown,
  ranges: AnalysisPolicyRanges,
): { value: AnalysisWarning[] } | { ok: false; violation: string } {
  if (!Array.isArray(value)) return fail('warnings is not an array');
  if (value.length > ranges.maxWarnings) return fail('warnings exceeds the permitted count');

  const warnings: AnalysisWarning[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return fail('warning is not an object');
    if (!isBoundedString(entry.code, ranges)) return fail('warning code invalid');
    if (!isBoundedString(entry.rationale, ranges)) return fail('warning rationale invalid');
    if (!isSeverity(entry.severity)) return fail('warning severity outside the closed set');

    const warning: AnalysisWarning = {
      code: entry.code,
      severity: entry.severity,
      rationale: entry.rationale,
    };
    if (entry.estimatedCostUsd !== undefined && entry.estimatedCostUsd !== null) {
      const cost = entry.estimatedCostUsd;
      if (
        typeof cost !== 'number' ||
        !Number.isFinite(cost) ||
        cost < 0 ||
        cost > ranges.maxEstimatedCostUsd
      ) {
        return fail('warning estimatedCostUsd out of range');
      }
      warning.estimatedCostUsd = cost;
    }
    warnings.push(warning);
  }
  return { value: warnings };
}

function stringArray(
  value: unknown,
  field: string,
  maxItems: number,
  ranges: AnalysisPolicyRanges,
): { value: string[] } | { ok: false; violation: string } {
  if (!Array.isArray(value)) return fail(`${field} is not an array`);
  if (value.length > maxItems) return fail(`${field} exceeds the permitted count`);
  for (const entry of value) {
    if (!isBoundedString(entry, ranges)) return fail(`${field} contains an invalid entry`);
  }
  return { value: value as string[] };
}

function fail(violation: string): { ok: false; violation: string } {
  return { ok: false, violation };
}

function isSeverity(value: unknown): value is AnalysisWarningSeverity {
  return typeof value === 'string' && SEVERITIES.includes(value as AnalysisWarningSeverity);
}

function isBoundedString(value: unknown, ranges: AnalysisPolicyRanges): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= ranges.maxTextLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
