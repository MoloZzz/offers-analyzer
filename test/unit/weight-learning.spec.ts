import {
  proposeSoftFlagPenalty,
  WeightSample,
  WEIGHT_MAX_STEP,
  PENALTY_MAX,
} from '../../src/modules/calibration/weight-learning';

function sample(softFlagsFired: number, good: boolean): WeightSample {
  return { softFlagsFired, good };
}

describe('proposeSoftFlagPenalty', () => {
  it('freezes when one group has fewer than WEIGHT_MIN_GROUP samples', () => {
    const samples: WeightSample[] = [
      // withFlags: only 3 samples (< 8)
      sample(1, false),
      sample(2, false),
      sample(1, true),
      // withoutFlags: 10 samples (>= 8)
      ...Array.from({ length: 10 }, (_, i) => sample(0, i % 2 === 0)),
    ];

    const result = proposeSoftFlagPenalty(samples, 0.8);

    expect(result.proposedSoftFlagPenalty).toBeNull();
    expect(result.reason).toContain('замало даних');
    expect(result.evidence).toBeNull();
  });

  it('strengthens the penalty when withFlags has a clearly higher bad-rate', () => {
    const current = 0.8;
    const samples: WeightSample[] = [
      // withFlags: 10 samples, mostly bad (8 bad, 2 good) -> badRate 0.8
      ...Array.from({ length: 8 }, () => sample(1, false)),
      ...Array.from({ length: 2 }, () => sample(1, true)),
      // withoutFlags: 10 samples, mostly good (1 bad, 9 good) -> badRate 0.1
      sample(0, false),
      ...Array.from({ length: 9 }, () => sample(0, true)),
    ];

    const result = proposeSoftFlagPenalty(samples, current);

    expect(result.proposedSoftFlagPenalty).not.toBeNull();
    expect(result.proposedSoftFlagPenalty as number).toBeLessThan(current);
    expect(current - (result.proposedSoftFlagPenalty as number)).toBeLessThanOrEqual(
      WEIGHT_MAX_STEP + 1e-9,
    );
    expect(result.evidence).not.toBeNull();
  });

  it('weakens the penalty when withFlags has a clearly lower bad-rate', () => {
    const current = 0.8;
    const samples: WeightSample[] = [
      // withFlags: 10 samples, mostly good (1 bad, 9 good) -> badRate 0.1
      sample(1, false),
      ...Array.from({ length: 9 }, () => sample(1, true)),
      // withoutFlags: 10 samples, mixed/worse (6 bad, 4 good) -> badRate 0.6
      ...Array.from({ length: 6 }, () => sample(0, false)),
      ...Array.from({ length: 4 }, () => sample(0, true)),
    ];

    const result = proposeSoftFlagPenalty(samples, current);

    expect(result.proposedSoftFlagPenalty).not.toBeNull();
    expect(result.proposedSoftFlagPenalty as number).toBeGreaterThan(current);
    expect((result.proposedSoftFlagPenalty as number) - current).toBeLessThanOrEqual(
      WEIGHT_MAX_STEP + 1e-9,
    );
    expect(result.proposedSoftFlagPenalty as number).toBeLessThanOrEqual(PENALTY_MAX);
  });

  it('reports no signal when bad-rates are similar in both groups', () => {
    const samples: WeightSample[] = [
      // withFlags: 8 samples, 4 bad / 4 good -> badRate 0.5
      ...Array.from({ length: 4 }, () => sample(1, false)),
      ...Array.from({ length: 4 }, () => sample(1, true)),
      // withoutFlags: 8 samples, 4 bad / 4 good -> badRate 0.5
      ...Array.from({ length: 4 }, () => sample(0, false)),
      ...Array.from({ length: 4 }, () => sample(0, true)),
    ];

    const result = proposeSoftFlagPenalty(samples, 0.8);

    expect(result.proposedSoftFlagPenalty).toBeNull();
    expect(result.reason).toContain('нема чіткого сигналу');
    expect(result.evidence).not.toBeNull();
  });

  it('clamps the proposal at PENALTY_MAX when weakening from near the ceiling', () => {
    const current = 0.98;
    const samples: WeightSample[] = [
      // withFlags: 10 samples, mostly good (1 bad, 9 good) -> badRate 0.1
      sample(1, false),
      ...Array.from({ length: 9 }, () => sample(1, true)),
      // withoutFlags: 10 samples, mixed/worse (6 bad, 4 good) -> badRate 0.6
      ...Array.from({ length: 6 }, () => sample(0, false)),
      ...Array.from({ length: 4 }, () => sample(0, true)),
    ];

    const result = proposeSoftFlagPenalty(samples, current);

    expect(result.proposedSoftFlagPenalty).not.toBeNull();
    expect(result.proposedSoftFlagPenalty as number).toBeLessThanOrEqual(PENALTY_MAX);
    expect(result.proposedSoftFlagPenalty).toBe(PENALTY_MAX);
  });
});
