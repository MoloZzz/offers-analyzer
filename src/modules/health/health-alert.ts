export type HealthAlert = 'down' | 'recovered' | null;

/** Decide whether to alert. Edge-triggered: alert once on going stale, once on recovery. */
export function decideHealthAlert(
  minutesSinceSuccess: number,
  wasAlerted: boolean,
  staleMinutes: number,
): { message: HealthAlert; alerted: boolean } {
  const stale = minutesSinceSuccess > staleMinutes;
  if (stale && !wasAlerted) return { message: 'down', alerted: true };
  if (!stale && wasAlerted) return { message: 'recovered', alerted: false };
  return { message: null, alerted: wasAlerted };
}
