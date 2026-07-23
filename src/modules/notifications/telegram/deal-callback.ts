import { DeclineReason } from '../../calibration/entities/deal-outcome.entity';

/**
 * Callback_data codec for the deal buttons (SPEC-007 US7.1) — mirrors `outcome-callback.ts`.
 * Telegram caps callback_data at 64 bytes; the longest payload here is
 * `dl:r:condition:<36-char uuid>` = 51 bytes, comfortably under the limit.
 */
export const DEAL_PREFIX = 'dl';

/** First-level action: 🛒 Купив or ❌ Відмова. */
export type DealAction = 'bought' | 'decline';

/** Encode the top-level deal button tap: `dl:bought:<opId>` / `dl:decline:<opId>`. */
export function buildDealCallback(action: DealAction, opportunityId: string): string {
  return `${DEAL_PREFIX}:${action}:${opportunityId}`;
}

/** Encode a decline-reason button tap: `dl:r:<reason>:<opId>`. */
export function buildDeclineReasonCallback(reason: DeclineReason, opportunityId: string): string {
  return `${DEAL_PREFIX}:r:${reason}:${opportunityId}`;
}

export type ParsedDeal =
  | { kind: 'action'; action: DealAction; opportunityId: string }
  | { kind: 'reason'; reason: DeclineReason; opportunityId: string };

/** Parse callback_data back; returns null if it isn't a valid deal callback. */
export function parseDealCallback(data: string): ParsedDeal | null {
  const reason = /^dl:r:(condition|documents|seller|price|other):(.+)$/.exec(data);
  if (reason) {
    return { kind: 'reason', reason: reason[1] as DeclineReason, opportunityId: reason[2] };
  }
  const action = /^dl:(bought|decline):(.+)$/.exec(data);
  if (action) {
    return { kind: 'action', action: action[1] as DealAction, opportunityId: action[2] };
  }
  return null;
}
