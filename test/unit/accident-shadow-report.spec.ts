/**
 * Spec 018 T009/T010 — the rollout report's aggregation rules.
 *
 * The assertions that matter are the ones that keep the report from overstating the case for
 * flipping: `severe` and `salvage` are never counted as suppressed, a listing killed by an unrelated
 * disqualifier is not attributed to the accident clamp, and the wording states that the report
 * authorizes a review rather than a change.
 */
import { formatAccidentShadow } from '../../src/modules/notifications/format/accident-shadow-message';
import {
  AccidentShadowRecord,
  buildAccidentShadowDigest,
  isSuppressedByAccidentClamp,
  wouldBePriceCore,
} from '../../src/modules/query/accident-shadow-report';

const NO_FLAGS = {
  suspicious_discount: false,
  damaged: false,
  salvage: false,
  confiscated: false,
  under_credit: false,
  desc_after_accident: false,
  desc_not_running: false,
};

function record(overrides: Partial<AccidentShadowRecord> = {}): AccidentShadowRecord {
  return {
    listingId: 'l-1',
    bucket: 'cosmetic',
    reason: 'corroborated-minor-claim',
    corroborated: true,
    disqualified: true,
    redFlags: { ...NO_FLAGS, damaged: true },
    raw: 0.9,
    confidence: 1,
    penalty: 1,
    discountPct: 27,
    thresholdUsed: 0.63,
    factorCount: 0,
    outcome: null,
    ...overrides,
  };
}

describe('isSuppressedByAccidentClamp', () => {
  it('counts a non-severe listing killed only by the damage bar', () => {
    expect(isSuppressedByAccidentClamp(record())).toBe(true);
  });

  it('counts a listing killed only by the description accident rule', () => {
    const r = record({ redFlags: { ...NO_FLAGS, desc_after_accident: true } });
    expect(isSuppressedByAccidentClamp(r)).toBe(true);
  });

  it('never counts a severe verdict — grading keeps killing it', () => {
    expect(isSuppressedByAccidentClamp(record({ bucket: 'severe' }))).toBe(false);
  });

  it('never counts a salvage listing — salvage stays hard in every configuration (FR-002)', () => {
    const r = record({ redFlags: { ...NO_FLAGS, damaged: true, salvage: true } });
    expect(isSuppressedByAccidentClamp(r)).toBe(false);
  });

  it.each([
    'suspicious_discount',
    'confiscated',
    'under_credit',
    'desc_not_running',
  ])('does not attribute a listing also killed by %s to the accident clamp', (code) => {
    const r = record({ redFlags: { ...NO_FLAGS, damaged: true, [code]: true } });
    expect(isSuppressedByAccidentClamp(r)).toBe(false);
  });

  it('ignores a listing that was never disqualified', () => {
    expect(isSuppressedByAccidentClamp(record({ disqualified: false }))).toBe(false);
  });
});

describe('wouldBePriceCore', () => {
  it('reconstructs the pre-clamp price core from the unclamped stored components', () => {
    expect(wouldBePriceCore(record({ raw: 0.8, confidence: 0.9, penalty: 0.8 }))).toBe(0.58);
  });
});

describe('buildAccidentShadowDigest', () => {
  it('reports an empty digest when nothing has been recorded yet', () => {
    const digest = buildAccidentShadowDigest([]);
    expect(digest.hasData).toBe(false);
    expect(digest.suppressedTotal).toBe(0);
  });

  it('separates suppressed listings that would have alerted from those that would not', () => {
    const digest = buildAccidentShadowDigest([
      record({ listingId: 'a', raw: 0.9 }), // 0.9 ≥ 0.63 → would have alerted
      record({ listingId: 'b', raw: 0.2 }), // below threshold anyway — the clamp is not what stopped it
    ]);
    expect(digest.suppressedTotal).toBe(2);
    expect(digest.wouldHaveAlertedTotal).toBe(1);
  });

  it('aggregates outcomes only for the would-have-alerted set', () => {
    const digest = buildAccidentShadowDigest([
      record({
        listingId: 'a',
        outcome: { disappeared: true, isRelist: true, domDays: 10, hadPriceCut: true },
      }),
      record({
        listingId: 'b',
        outcome: { disappeared: true, isRelist: false, domDays: 20, hadPriceCut: false },
      }),
      // Below threshold: its outcome must not dilute the evidence for the flip decision.
      record({
        listingId: 'c',
        raw: 0.1,
        outcome: { disappeared: true, isRelist: true, domDays: 90, hadPriceCut: true },
      }),
    ]);
    expect(digest.outcomesTotal).toEqual({
      observed: 2,
      relisted: 1,
      hadPriceCut: 1,
      medianDomDays: 15,
    });
  });

  it('breaks the totals down per bucket and counts VIN corroboration', () => {
    const digest = buildAccidentShadowDigest([
      record({ listingId: 'a', bucket: 'cosmetic', corroborated: true }),
      record({ listingId: 'b', bucket: 'unknown', corroborated: false }),
      record({ listingId: 'c', bucket: 'severe', corroborated: false }),
    ]);
    const byBucket = Object.fromEntries(digest.bucketStats.map((s) => [s.bucket, s]));
    expect(byBucket.cosmetic).toMatchObject({ total: 1, corroborated: 1, suppressed: 1 });
    expect(byBucket.unknown).toMatchObject({ total: 1, corroborated: 0, suppressed: 1 });
    expect(byBucket.severe).toMatchObject({ total: 1, suppressed: 0, wouldHaveAlerted: 0 });
  });

  it('flags that composite factors make the would-be price core an under-estimate', () => {
    expect(buildAccidentShadowDigest([record({ factorCount: 1 })]).factorsActive).toBe(true);
    expect(buildAccidentShadowDigest([record()]).factorsActive).toBe(false);
  });
});

describe('formatAccidentShadow (FR-007)', () => {
  it('states that the report authorizes a review, not a flip', () => {
    const text = formatAccidentShadow(buildAccidentShadowDigest([record()]));
    expect(text).toContain('перегляду');
    expect(text).toContain('НЕ перемикати');
  });

  it('says nothing has been recorded yet rather than implying a clean result', () => {
    const text = formatAccidentShadow(buildAccidentShadowDigest([]));
    expect(text).toContain('ще немає');
  });

  it('never claims the score or alert set changed', () => {
    const text = formatAccidentShadow(buildAccidentShadowDigest([record()]));
    expect(text).toContain('не змінені');
  });
});
