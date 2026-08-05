import { Currency } from '../../src/common/types/money';
import {
  buildBreakdown,
  buildLiveBreakdown,
  renderBreakdownFlat,
  renderBreakdownSections,
} from '../../src/modules/notifications/format/breakdown';
import { Breakdown, BreakdownSectionKey } from '../../src/modules/notifications/format/breakdown.types';
import { formatAssessment } from '../../src/modules/notifications/format/opportunity-message';
import { formatStoredWhy, formatWhy } from '../../src/modules/notifications/format/why-message';
import { ListingDetail } from '../../src/modules/sources/ports/listing-source.port';
import { EvaluationExplanation } from '../../src/modules/valuation/evaluation-explanation';
import { ValuationResult } from '../../src/modules/valuation/valuation.service';

/**
 * SC-004 proof: one listing rendered through the `Деталі` button, `/why`, and `/check` produces an
 * identical section order and identical parameter labels. Fixtures are copied from
 * `test/unit/breakdown.spec.ts` (the `v1` stored explanation and the `buildLiveBreakdown` fixture
 * pair) so the two spec files agree on what "the same car" means.
 */

/** Stored snapshot — same shape as `v1` in breakdown.spec.ts. */
const storedExplanation: EvaluationExplanation = {
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

/** Live equivalent of the same car — same shape as the `buildLiveBreakdown` fixture pair. */
const liveDetail = {
  externalId: '38561317',
  make: 'BMW',
  model: '3 Series',
  year: 2017,
  url: 'https://auto.ria.com/auto_38561317.html',
  price: { amount: 12000, currency: Currency.USD },
} as unknown as ListingDetail;

const liveResult = {
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

const liveCtx = {
  fairValue: 16000,
  currency: Currency.USD,
  sampleSize: 12,
  benchmarkBase: 15500,
  mileageAware: false,
};

/** Labelled lines only — prose lines (`label` unset) carry no comparable parameter identity. */
function labelsBySection(breakdown: Breakdown): Record<BreakdownSectionKey, string[]> {
  const out: Record<string, string[]> = {};
  for (const section of breakdown.sections) {
    out[section.key] = section.lines.filter((l) => l.label).map((l) => l.label);
  }
  return out as Record<BreakdownSectionKey, string[]>;
}

describe('breakdown surface parity — Деталі / /why / /check render the same shape (SC-004, US16.3)', () => {
  const stored = buildBreakdown(storedExplanation);
  const live = buildLiveBreakdown(liveDetail, liveResult, liveCtx);

  // Section *order* alone is already owned by `breakdown.spec.ts` ("produces the same sections in
  // the same order as a stored record"). The label test below subsumes it — `Object.keys` preserves
  // insertion order, so comparing the key arrays checks order as well as membership.
  it('emits identical parameter labels per section; live differs only in availability/value', () => {
    const storedLabels = labelsBySection(stored);
    const liveLabels = labelsBySection(live);

    expect(Object.keys(liveLabels)).toEqual(Object.keys(storedLabels));
    for (const key of Object.keys(storedLabels)) {
      expect(liveLabels[key as BreakdownSectionKey]).toEqual(storedLabels[key as BreakdownSectionKey]);
    }

    // Sanity: the parity above is not a tautology over an empty fixture — the confidence and
    // monetary sections do genuinely differ in reason/availability between the two builds while
    // keeping the same label set, which is exactly the claim SC-004 makes.
    const confidenceLine = (b: Breakdown) => b.sections.find((s) => s.key === 'confidence')?.lines[0];
    expect(confidenceLine(stored)?.reason).toBe('schema');
    expect(confidenceLine(live)?.reason).toBe('unmeasured');
    expect(confidenceLine(stored)?.label).toBe(confidenceLine(live)?.label);
  });

  it('lists every stored section title inside the /check reply, in the same relative order', () => {
    const storedTitles = renderBreakdownSections(stored).map((block) => block.split('\n')[0]);
    const checkReply = formatAssessment(liveDetail, liveResult, liveCtx);

    let cursor = -1;
    for (const title of storedTitles) {
      const at = checkReply.indexOf(title);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('renders /why (flat) and the Деталі button (sectioned) with the same parameters — the only difference is section titles', () => {
    for (const breakdown of [stored, live]) {
      const flatLines = renderBreakdownFlat(breakdown);
      const sectionBlocks = renderBreakdownSections(breakdown);
      // Strip each block's leading title line; what remains must reassemble the flat rendering
      // exactly — proving the two renderers diverge only by the title, never by parameter content.
      const reassembled = sectionBlocks.flatMap((block) => block.split('\n').slice(1));

      expect(reassembled).toEqual(flatLines);
    }
  });

  it('marks /check as the only surface that may spend a source request (US16.3 AS-2)', () => {
    const sourceNoteFragment = '/check рахує оцінку наново і витрачає запит до джерела';

    const checkReply = formatAssessment(liveDetail, liveResult, liveCtx);
    const whyLiveReply = formatWhy(liveDetail, liveResult, liveCtx);
    const whyStoredReply = formatStoredWhy(storedExplanation);
    const detailsReply = renderBreakdownSections(stored).join('\n\n');

    expect(checkReply).toContain(sourceNoteFragment);
    expect(whyLiveReply).not.toContain(sourceNoteFragment);
    expect(whyStoredReply).not.toContain(sourceNoteFragment);
    expect(detailsReply).not.toContain(sourceNoteFragment);
  });
});
