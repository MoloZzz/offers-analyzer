export const OUTCOME_PREFIX = 'oc';

/** Encode a button tap as callback_data (<64 bytes): `oc:<label>:<opportunityId>`. */
export function buildOutcomeCallback(label: 'good' | 'bad', opportunityId: string): string {
  return `${OUTCOME_PREFIX}:${label}:${opportunityId}`;
}

export interface ParsedOutcome {
  label: 'good' | 'bad';
  opportunityId: string;
}

/** Parse callback_data back; returns null if it isn't a valid outcome callback. */
export function parseOutcomeCallback(data: string): ParsedOutcome | null {
  const m = /^oc:(good|bad):(.+)$/.exec(data);
  return m ? { label: m[1] as 'good' | 'bad', opportunityId: m[2] } : null;
}
