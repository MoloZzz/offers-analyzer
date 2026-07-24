import { DealPatch } from '../../calibration/deal-margin';
import { DECLINE_REASONS, DeclineReason } from '../../calibration/entities/deal-outcome.entity';

/**
 * Parser for the single-shot `/deal <link> buy=8500 costs=300 sell=10200 dom=21 reason=price [note]`
 * command (SPEC-007 US7.1) — pure, IO-free. Every field is optional; unknown tokens that aren't
 * `key=value` are collected as a trailing free-text note. Invalid numbers or reasons abort with an
 * `error` (the caller records nothing and replies with usage).
 *
 * The leading listing link/id is NOT parsed here — the caller extracts it first (extractAutoId),
 * then passes the remainder to this function.
 */
export interface ParsedDealArgs {
  patch: DealPatch;
  error?: string;
}

/**
 * Split a raw `/deal` argument string into the leading listing link/id token and the remaining
 * `key=value` fields. Splitting on the FIRST whitespace-delimited token (rather than scanning the
 * whole string for a 6+-digit run) keeps a price field like `sell=100200` from being mistaken for
 * the listing's auto_id — that bug is exactly what motivated this helper.
 */
export function splitDealCommand(raw: string): { linkToken: string; rest: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { linkToken: '', rest: '' };
  const match = trimmed.match(/^(\S+)\s*([\s\S]*)$/);
  if (!match) return { linkToken: trimmed, rest: '' };
  return { linkToken: match[1], rest: match[2].trim() };
}

type NumericField = 'buyPriceUsd' | 'actualCostsUsd' | 'sellPriceUsd' | 'daysOnMarket';

const NUMERIC_KEYS: Record<string, NumericField> = {
  buy: 'buyPriceUsd',
  costs: 'actualCostsUsd',
  sell: 'sellPriceUsd',
  dom: 'daysOnMarket',
};

export function parseDealArgs(arg: string): ParsedDealArgs {
  const patch: DealPatch = {};
  const noteParts: string[] = [];

  for (const token of arg.split(/\s+/).filter(Boolean)) {
    const eq = token.indexOf('=');
    if (eq === -1) {
      noteParts.push(token);
      continue;
    }
    const key = token.slice(0, eq).toLowerCase();
    const rawValue = token.slice(eq + 1);

    if (key in NUMERIC_KEYS) {
      const value = Number(rawValue);
      if (!Number.isFinite(value) || value < 0) {
        return { patch: {}, error: `Некоректне число для «${key}»: ${rawValue}` };
      }
      const field = NUMERIC_KEYS[key];
      // dom is a whole-day count; the money fields keep decimals.
      patch[field] = field === 'daysOnMarket' ? Math.round(value) : value;
      continue;
    }

    if (key === 'reason') {
      const reason = rawValue.toLowerCase();
      if (!DECLINE_REASONS.includes(reason as DeclineReason)) {
        return {
          patch: {},
          error: `Невідома причина «${rawValue}». Доступні: ${DECLINE_REASONS.join(', ')}`,
        };
      }
      patch.declineReason = reason;
      continue;
    }

    // Unknown key=value — treat the whole token as note text rather than silently dropping it.
    noteParts.push(token);
  }

  if (noteParts.length > 0) patch.note = noteParts.join(' ');
  return { patch };
}
