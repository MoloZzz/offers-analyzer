/**
 * The `🤖 AI-аналіз` button's callback plumbing (spec 017 T032).
 *
 * A **separate** module and a separate prefix from spec 016's `Деталі` button, and the two must not
 * be merged. They look alike and are not: `Деталі` renders the deterministic breakdown from storage
 * for free and for anyone, while this one is admin-only, spends real money with an external
 * provider, and returns an explicitly advisory opinion. Sharing plumbing would make the next person
 * to touch it plausibly assume they share a cost and permission model too.
 *
 * Pure module: no Nest, no repository, no provider. Everything the reply needs is re-read from
 * storage by `AnalysisService`.
 */

export const ANALYZE_PREFIX = 'ai';

/**
 * `ai:<listingId>` — the listing UUID and nothing else. Telegram caps `callback_data` at 64 bytes;
 * `ai:` plus a 36-character UUID is 39, and the remaining room is deliberately left unused rather
 * than filled with state that storage already holds.
 */
export function buildAnalyzeCallback(listingId: string): string {
  return `${ANALYZE_PREFIX}:${listingId}`;
}

/** Parse callback_data back to a listing id; `null` when it isn't an analyze callback. */
export function parseAnalyzeCallback(data: string): string | null {
  const match = /^ai:(.+)$/.exec(data);
  return match ? match[1] : null;
}
