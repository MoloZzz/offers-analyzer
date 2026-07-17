import {
  buildDigest,
  distribution,
  formatReport,
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
});
