import { WeightProposal } from '../../calibration/weight-learning';

/** Ukrainian summary of a weight-learning proposal for the bot. */
export function formatWeights(p: WeightProposal, candidateVersion: number | null): string {
  const lines = ['🧪 Навчання ваг (штраф мʼяких прапорців)'];
  if (p.evidence) {
    lines.push(
      `👎-частка: з прапорцями ${p.evidence.withFlags.badRate} (${p.evidence.withFlags.count}) · без ${p.evidence.withoutFlags.badRate} (${p.evidence.withoutFlags.count})`,
    );
  }
  lines.push(p.reason);
  if (p.proposedSoftFlagPenalty != null && candidateVersion != null) {
    lines.push(`Пропозиція: штраф → ${p.proposedSoftFlagPenalty} (кандидат v${candidateVersion}). Застосувати: /weights_apply`);
  } else {
    lines.push('Змін не пропонується.');
  }
  return lines.join('\n');
}
