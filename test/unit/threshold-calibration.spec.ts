import {
  MAX_STEP,
  MIN_SCORES,
  proposeThreshold,
} from '../../src/modules/calibration/threshold-calibration';

describe('proposeThreshold', () => {
  it('freezes when there are too few recorded scores', () => {
    const scores = Array.from({ length: MIN_SCORES - 1 }, (_, i) => 0.4 + i * 0.01);
    const result = proposeThreshold({ scores, currentThreshold: 0.6, precision: null, labeledCount: 0 }, {});

    expect(result.proposed).toBeNull();
    expect(result.reason).toContain('замало даних');
  });

  it('raises the threshold when realized precision misses the target', () => {
    const scores = Array.from({ length: 30 }, (_, i) => i / 30);
    const currentThreshold = 0.6;

    const result = proposeThreshold(
      { scores, currentThreshold, precision: 0.5, labeledCount: 20 },
      { minPrecision: 0.7 },
    );

    expect(result.proposed).not.toBeNull();
    expect(result.proposed as number).toBeGreaterThan(currentThreshold);
    expect(Math.abs((result.proposed as number) - currentThreshold)).toBeLessThanOrEqual(MAX_STEP + 1e-9);
  });

  it('raises the threshold, bounded by MAX_STEP, when there are too many candidates', () => {
    const currentThreshold = 0.3;
    const highScores = Array.from({ length: 25 }, (_, i) => 0.35 + i * 0.025); // 0.35..0.95, all above threshold
    const lowScores = [0.05, 0.1, 0.15, 0.2, 0.25]; // below threshold
    const scores = [...highScores, ...lowScores];

    const result = proposeThreshold(
      { scores, currentThreshold, precision: null, labeledCount: 0 },
      { maxVolume: 5 },
    );

    expect(result.proposed).not.toBeNull();
    expect(result.proposed as number).toBeGreaterThan(currentThreshold);
    expect(Math.abs((result.proposed as number) - currentThreshold)).toBeLessThanOrEqual(MAX_STEP + 1e-9);
  });

  it('lowers the threshold when there are too few candidates', () => {
    const currentThreshold = 0.6;
    const highScores = [0.65, 0.7, 0.75]; // above threshold — few qualifiers
    const lowScores = Array.from({ length: 27 }, (_, i) => 0.05 + i * 0.01); // 0.05..0.31, below threshold
    const scores = [...highScores, ...lowScores];

    const result = proposeThreshold(
      { scores, currentThreshold, precision: null, labeledCount: 0 },
      { minVolume: 25 },
    );

    expect(result.proposed).not.toBeNull();
    expect(result.proposed as number).toBeLessThan(currentThreshold);
  });

  it('makes no change when the volume is already within the target corridor', () => {
    const currentThreshold = 0.5;
    const highScores = Array.from({ length: 10 }, (_, i) => 0.5 + i * 0.01); // 10 qualifiers
    const lowScores = Array.from({ length: 15 }, (_, i) => 0.1 + i * 0.01);
    const scores = [...highScores, ...lowScores];

    const result = proposeThreshold(
      { scores, currentThreshold, precision: null, labeledCount: 0 },
      { minVolume: 5, maxVolume: 15 },
    );

    expect(result.proposed).toBeNull();
    expect(result.reason).toContain('у межах цілі');
  });

  it('bounds even a large ideal jump to MAX_STEP', () => {
    const currentThreshold = 0.6;
    // Almost nothing qualifies at 0.6, but the target demands nearly everyone qualify —
    // the ideal jump (down to near 0) is far larger than MAX_STEP.
    const scores = Array.from({ length: 40 }, (_, i) => (i / 40) * 0.5); // 0..~0.49, all below threshold

    const result = proposeThreshold(
      { scores, currentThreshold, precision: null, labeledCount: 0 },
      { minVolume: 40 },
    );

    expect(result.proposed).not.toBeNull();
    expect(Math.abs((result.proposed as number) - currentThreshold)).toBeLessThanOrEqual(MAX_STEP + 1e-9);
  });
});
