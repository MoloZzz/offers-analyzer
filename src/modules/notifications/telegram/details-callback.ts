/**
 * The `Деталі` button's callback plumbing (spec 016 US16.2).
 *
 * Deliberately a **pure module**: no Nest, no repository, and above all no `LISTING_SOURCE`. The
 * breakdown must never cost a source request (FR-002, SC-002), and the cheapest way to guarantee
 * that is to make the dependency impossible to reach from here rather than merely absent by
 * discipline. Adding one later would be a visible, reviewable change to this file's imports.
 */

export const DETAILS_PREFIX = 'details';

/**
 * `details:<listingId>` — the listing UUID and nothing else. Telegram caps `callback_data` at 64
 * bytes; `details:` plus a 36-character UUID is 44, which leaves no room for encoded state and is
 * exactly why none is carried. Everything else the reply needs is re-read from storage.
 */
export function buildDetailsCallback(listingId: string): string {
  return `${DETAILS_PREFIX}:${listingId}`;
}

/** Parse callback_data back to a listing id; `null` when it isn't a details callback. */
export function parseDetailsCallback(data: string): string | null {
  const match = /^details:(.+)$/.exec(data);
  return match ? match[1] : null;
}

/** Telegram's hard limit on a single text message. */
export const TELEGRAM_MESSAGE_LIMIT = 4096;

/** Room reserved for the `Деталі (n/m)` header a multi-part reply prepends. */
const PART_MARKER_RESERVE = 24;

/**
 * Pack rendered sections into messages, splitting **at section boundaries only** (FR-007).
 *
 * A section is the unit the operator reads; cutting one in half would strand a parameter from its
 * heading. The one exception is a single section that exceeds the limit on its own — dropping its
 * tail would be worse than a line-level split, so that case falls back to splitting on line
 * boundaries. In practice it is unreachable: the largest section today is a few hundred bytes.
 */
export function splitIntoMessages(
  sections: string[],
  limit: number = TELEGRAM_MESSAGE_LIMIT,
): string[] {
  const budget = limit - PART_MARKER_RESERVE;
  const blocks = sections.flatMap((s) => (s.length <= budget ? [s] : splitLongSection(s, budget)));

  const parts: string[] = [];
  let current = '';
  for (const block of blocks) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length <= budget) {
      current = candidate;
      continue;
    }
    if (current) parts.push(current);
    current = block;
  }
  if (current) parts.push(current);

  if (parts.length <= 1) return parts;
  return parts.map((part, i) => `Деталі (${i + 1}/${parts.length})\n${part}`);
}

/** Last-resort line-boundary split for a section too large to fit any message. */
function splitLongSection(section: string, budget: number): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const line of section.split('\n')) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= budget) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    // A single line longer than the whole budget is truncated rather than dropped; there is no
    // smaller boundary left to split on.
    current = line.length <= budget ? line : line.slice(0, budget);
  }
  if (current) chunks.push(current);
  return chunks;
}
