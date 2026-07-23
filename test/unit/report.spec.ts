import {
  buildDigest,
  distribution,
  formatReport,
  realizedPrecision,
  suggestedThreshold,
} from '../../src/modules/query/report';

describe('self-tuning report (R1)', () => {
  it('buckets scores by sign and threshold', () => {
    const d = distribution([-0.2, 0, 0.1, 0.2, 0.5], 0.15);
    expect(d).toEqual({ belowZero: 1, zeroToThreshold: 2, atOrAbove: 2 }); // 0 and 0.1 below 0.15
  });

  it('suggests the score that yields ~targetCount candidates', () => {
    const scores = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.05];
    expect(suggestedThreshold(scores, 0.5, 10)).toBe(0.05); // 10th-highest
  });

  it('returns null when data is too thin or suggestion ≈ current', () => {
    expect(suggestedThreshold([0.4, 0.3], 0.15, 10)).toBeNull();
    const scores = new Array(10).fill(0.15);
    expect(suggestedThreshold(scores, 0.15, 10)).toBeNull(); // ≈ current
  });

  it('formats a readable Ukrainian digest', () => {
    const digest = buildDigest([0.2, -0.1, 0.05], 1, [], 0.15, 10);
    const text = formatReport(digest);
    expect(text).toContain('Звіт по відбору');
    expect(text).toContain('Оцінено оголошень: 3');
    expect(text).toContain('Вигідних (бал ≥ 0.15): 1');
  });

  it('computes realized precision as the share of 👍 among labeled outcomes', () => {
    expect(realizedPrecision(3, 1)).toEqual({ good: 3, bad: 1, precision: 0.75 });
  });

  it('returns null realized precision when there are no labels yet', () => {
    expect(realizedPrecision(0, 0)).toBeNull();
  });

  it('includes realized precision in the digest and its formatted report', () => {
    const digest = buildDigest([0.2, -0.1, 0.05], 1, [], 0.15, 10, realizedPrecision(2, 0));
    expect(digest.realizedPrecision).toEqual({ good: 2, bad: 0, precision: 1 });
    expect(formatReport(digest)).toContain('Реальна точність');
  });

  it('reports no scores yet when realized precision is null', () => {
    const digest = buildDigest([0.2, -0.1, 0.05], 1, [], 0.15, 10, null);
    expect(formatReport(digest)).toContain('поки немає оцінок');
  });

  it('surfaces realized deals in the digest + report when there are closed deals', () => {
    const digest = buildDigest([0.2], 1, [], 0.15, 10, null, {
      closed: 3,
      medianMarginUsd: 1200,
      lossShare: 0,
      medianDom: 21,
    });
    expect(digest.realizedDeals).toEqual({
      closed: 3,
      medianMarginUsd: 1200,
      lossShare: 0,
      medianDom: 21,
    });
    const text = formatReport(digest);
    expect(text).toContain('Закриті угоди: 3');
    expect(text).toContain('медіанна маржа $1200');
    expect(text).toContain('медіанний DOM 21');
  });

  it('drops the realized-deals block when there are no closed deals', () => {
    const zero = buildDigest([0.2], 1, [], 0.15, 10, null, {
      closed: 0,
      medianMarginUsd: null,
      lossShare: null,
      medianDom: null,
    });
    expect(zero.realizedDeals).toBeNull();
    expect(formatReport(zero)).toContain('Закритих угод поки немає');

    const none = buildDigest([0.2], 1, [], 0.15, 10, null, null);
    expect(formatReport(none)).toContain('Закритих угод поки немає');
  });
});
