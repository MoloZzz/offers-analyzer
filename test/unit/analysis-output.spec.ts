/**
 * SPEC-017 T005 — strict output validation (FR-004).
 *
 * The rule under test is not "reject bad payloads" but "reject them **whole**": every failing case
 * asserts that no partial value comes back, because a partially accepted answer is the failure mode
 * that would put unvalidated model text in front of the operator.
 */
import { validateAnalysisOutput } from '../../src/modules/analysis/analysis-output';
import { ANALYSIS_V1_POLICY } from '../../src/modules/analysis/analysis-policy';

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    warnings: [
      { code: 'dsg_mechatronics', severity: 'high', rationale: 'Типова відмова на цьому пробігу.', estimatedCostUsd: 900 },
      { code: 'timing_chain', severity: 'medium', rationale: 'Перевірити розтягнення ланцюга.' },
    ],
    inspectionChecklist: ['Перевірити роботу DSG на холодну', 'Компресія циліндрів'],
    sellerQuestions: ['Коли міняли мехатронік?'],
    advisoryScore: 6,
    advisoryScoreRationale: 'Ціна відповідає ризику по коробці.',
    reliabilityNotes: ['DSG DQ250 — відомі проблеми мехатроніка.'],
    ...overrides,
  };
}

const validate = (value: unknown) => validateAnalysisOutput(value, ANALYSIS_V1_POLICY);

describe('SPEC-017 output validation — accepts a schema-valid payload', () => {
  it('parses warnings, checklist, questions, score and notes', () => {
    const result = validate(payload());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.warnings).toHaveLength(2);
    expect(result.value.warnings[0].estimatedCostUsd).toBe(900);
    expect(result.value.warnings[1].estimatedCostUsd).toBeUndefined();
    expect(result.value.advisoryScore).toBe(6);
    expect(result.value.reliabilityNotes).toEqual(['DSG DQ250 — відомі проблеми мехатроніка.']);
  });

  it('accepts an answer with no reliability notes at all', () => {
    const result = validate(payload({ reliabilityNotes: undefined }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.reliabilityNotes).toEqual([]);
  });

  it('accepts empty warning and question lists (nothing to say is a valid answer)', () => {
    expect(validate(payload({ warnings: [], sellerQuestions: [] })).ok).toBe(true);
  });
});

describe('SPEC-017 output validation — rejects whole, never partially (FR-004)', () => {
  it.each([
    ['advisoryScore just above the 0-10 range', payload({ advisoryScore: 62 })],
    ['advisoryScore far above range', payload({ advisoryScore: 900 })],
    ['advisoryScore below range', payload({ advisoryScore: -1 })],
    ['advisoryScore not a number', payload({ advisoryScore: '6' })],
    ['advisoryScore missing', payload({ advisoryScore: undefined })],
    ['unknown severity', payload({ warnings: [{ code: 'x', severity: 'catastrophic', rationale: 'r' }] })],
    ['missing severity', payload({ warnings: [{ code: 'x', rationale: 'r' }] })],
    [
      'negative repair cost',
      payload({ warnings: [{ code: 'x', severity: 'low', rationale: 'r', estimatedCostUsd: -50 }] }),
    ],
    [
      'absurd repair cost',
      payload({ warnings: [{ code: 'x', severity: 'low', rationale: 'r', estimatedCostUsd: 1e9 }] }),
    ],
    ['warnings not an array', payload({ warnings: { code: 'x' } })],
    ['checklist item not a string', payload({ inspectionChecklist: ['ok', 42] })],
    ['checklist item empty', payload({ inspectionChecklist: ['ok', '   '] })],
    ['rationale missing', payload({ advisoryScoreRationale: undefined })],
    ['payload is a string', 'not an object'],
    ['payload is null', null],
    ['payload is an array', []],
  ])('rejects %s and yields no partial value', (_label, invalid) => {
    const result = validate(invalid);

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('value');
    if (!result.ok) expect(result.violation).toBeTruthy();
  });

  it('rejects an over-long list rather than trimming it', () => {
    const overLong = Array.from({ length: ANALYSIS_V1_POLICY.ranges.maxChecklistItems + 1 }, () => 'x');
    expect(validate(payload({ inspectionChecklist: overLong })).ok).toBe(false);
  });

  it('rejects an over-long string rather than truncating it', () => {
    const overLong = 'x'.repeat(ANALYSIS_V1_POLICY.ranges.maxTextLength + 1);
    expect(validate(payload({ advisoryScoreRationale: overLong })).ok).toBe(false);
  });

  it('rejects the whole payload when only one warning of several is malformed', () => {
    const mixed = payload({
      warnings: [
        { code: 'good', severity: 'low', rationale: 'fine' },
        { code: 'bad', severity: 'nonsense', rationale: 'fine' },
      ],
    });

    expect(validate(mixed).ok).toBe(false);
  });
});
