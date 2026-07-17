/**
 * Self-tuning report (R1) — pure aggregation + formatting over stored evaluations, so the operator
 * can see how the selection is behaving and how to tune the threshold. No IO here (unit-testable):
 * the service fetches the raw numbers, these functions turn them into a digest + a Telegram message.
 */

export interface NearMiss {
  label: string;
  score: number;
  url: string;
}

export interface ScoreDistribution {
  belowZero: number;
  zeroToThreshold: number;
  atOrAbove: number;
}

export interface ReportDigest {
  threshold: number;
  evaluated: number;
  opportunities: number;
  distribution: ScoreDistribution;
  nearMisses: NearMiss[];
  /** A threshold that would yield ~targetCount candidates, or null when it ≈ current / data is thin. */
  suggestedThreshold: number | null;
  realizedPrecision: RealizedPrecision | null;
}

export interface RealizedPrecision {
  good: number;
  bad: number;
  precision: number | null;
}

/** Share of 👍 among labeled (👍/👎) outcomes. null when there are no labels yet. */
export function realizedPrecision(good: number, bad: number): RealizedPrecision | null {
  const total = good + bad;
  if (total === 0) return null;
  return { good, bad, precision: Math.round((good / total) * 100) / 100 };
}

export function distribution(scores: number[], threshold: number): ScoreDistribution {
  const dist: ScoreDistribution = { belowZero: 0, zeroToThreshold: 0, atOrAbove: 0 };
  for (const s of scores) {
    if (s < 0) dist.belowZero += 1;
    else if (s < threshold) dist.zeroToThreshold += 1;
    else dist.atOrAbove += 1;
  }
  return dist;
}

/** The score that would surface ~targetCount best listings; null if that ≈ current threshold or data is thin. */
export function suggestedThreshold(
  scores: number[],
  threshold: number,
  targetCount: number,
): number | null {
  if (scores.length < targetCount) return null;
  const nth = [...scores].sort((a, b) => b - a)[targetCount - 1];
  const rounded = Math.round(nth * 100) / 100;
  return Math.abs(rounded - threshold) < 0.02 ? null : rounded;
}

export function buildDigest(
  scores: number[],
  opportunities: number,
  nearMisses: NearMiss[],
  threshold: number,
  targetCount = 10,
  precision: RealizedPrecision | null = null,
): ReportDigest {
  return {
    threshold,
    evaluated: scores.length,
    opportunities,
    distribution: distribution(scores, threshold),
    nearMisses,
    suggestedThreshold: suggestedThreshold(scores, threshold, targetCount),
    realizedPrecision: precision,
  };
}

/** Ukrainian Telegram message for the /report command. */
export function formatReport(d: ReportDigest): string {
  const lines = [
    '📊 Звіт по відбору',
    `Оцінено оголошень: ${d.evaluated}`,
    `Вигідних (бал ≥ ${d.threshold}): ${d.opportunities}`,
    d.realizedPrecision != null
      ? `Реальна точність (👍/👎, ~30 днів): 👍 ${d.realizedPrecision.good} / 👎 ${d.realizedPrecision.bad} → ${Math.round((d.realizedPrecision.precision ?? 0) * 100)}%`
      : `Реальна точність: поки немає оцінок 👍/👎`,
    `Розподіл балів: <0 — ${d.distribution.belowZero} · 0…${d.threshold} — ${d.distribution.zeroToThreshold} · ≥${d.threshold} — ${d.distribution.atOrAbove}`,
  ];
  if (d.nearMisses.length > 0) {
    lines.push('Майже дотягнули (трохи нижче порогу):');
    for (const n of d.nearMisses) lines.push(`• ${n.label} — бал ${n.score}\n  ${n.url}`);
  }
  lines.push(
    d.suggestedThreshold != null
      ? `💡 Порада: поріг ≈ ${d.suggestedThreshold} дасть ~10 кандидатів (зараз ${d.threshold}).`
      : `💡 Поточний поріг ${d.threshold} виглядає доречним (або замало даних для поради).`,
  );
  return lines.join('\n');
}
