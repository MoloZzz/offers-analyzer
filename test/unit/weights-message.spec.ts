import { formatWeights } from '../../src/modules/notifications/format/weights-message';
import { WeightProposal } from '../../src/modules/calibration/weight-learning';

describe('formatWeights', () => {
  it('formats a proposal with a candidate version', () => {
    const proposal: WeightProposal = {
      proposedSoftFlagPenalty: 0.75,
      reason: 'мʼякі прапорці корелюють з 👎',
      evidence: {
        withFlags: { count: 10, badRate: 0.7 },
        withoutFlags: { count: 12, badRate: 0.3 },
      },
    };

    const text = formatWeights(proposal, 2);

    expect(text).toContain('Навчання ваг');
    expect(text).toContain('👎-частка');
    expect(text).toContain('штраф → 0.75');
    expect(text).toContain('кандидат v2');
    expect(text).toContain('/weights_apply');
  });

  it('formats a no-change proposal', () => {
    const proposal: WeightProposal = {
      proposedSoftFlagPenalty: null,
      reason: 'нема чіткого сигналу',
      evidence: {
        withFlags: { count: 10, badRate: 0.5 },
        withoutFlags: { count: 12, badRate: 0.5 },
      },
    };

    const text = formatWeights(proposal, null);

    expect(text).toContain('Змін не пропонується');
  });
});
