/**
 * Graded accident severity (spec 018, ADR-0020). Maps the AUTO.RIA risk bar plus the stored seller
 * description to `cosmetic | moderate | severe | unknown` with the matched evidence listed. Pure +
 * deterministic → unit-testable, zero API budget (everything it reads is already fetched).
 *
 * This is deliberately **not** part of condition.ts. That module answers "does the text mention a
 * problem" and feeds booleans to the red-flags; this one answers "how bad", and the two have
 * different lifecycles (plan.md, Technical Context). The negation guard below therefore *mirrors*
 * condition.ts rather than sharing an extraction with it — a one-line regex is a cheaper duplicate
 * than a coupling the spec explicitly rejects.
 *
 * **The hard part is not grading — it is not being gamed.** Seller text systematically understates
 * damage; nobody advertises cut pillars. So severity resolves as `max(bar, text)` with exactly one
 * asymmetry: text may raise severity freely, but may lower it below `unknown` only when a VIN check
 * corroborates it. That asymmetry is implemented as an explicit **floor**, not as a scoring weight —
 * a penalty can be out-earned by a deep enough discount and the gaming payoff scales with the
 * discount, whereas a floor cannot be out-earned at any price. Same shape ADR-0014 uses for claimed
 * mileage.
 *
 * Nothing consumes this verdict yet. Wiring it into the evaluation explanation is spec 018 phase 2
 * (shadow recording); turning it into graded penalties is phase 3 and needs operator approval.
 */

/** Severity buckets. `unknown` means "we do not know how bad" — never "it was minor". */
export type AccidentBucket = 'cosmetic' | 'moderate' | 'severe' | 'unknown';

/**
 * Resolution order — how *conservative* a verdict is, not how large its penalty is. `unknown`
 * outranks `moderate` because an unestablished severity must never be resolved down to a
 * self-reported one. Phase 3's per-bucket penalty magnitudes are a separate ParameterSet map and
 * are not required to follow this order.
 */
const RANK: Record<AccidentBucket, number> = { cosmetic: 0, moderate: 1, unknown: 2, severe: 3 };

/** Buckets strictly below `unknown` — the ones a seller could reach by typing, hence the floor. */
function isBelowUnknown(bucket: AccidentBucket): boolean {
  return RANK[bucket] < RANK.unknown;
}

/** A single matched marker and where it came from. */
export interface AccidentEvidence {
  marker: string;
  source: 'bar' | 'text';
}

/**
 * Stable machine codes, not operator-facing copy. Rendering (and the explicit review that the
 * `unknown` wording must not read as reassurance) is spec 018 phase 4 / FR-004.
 */
export type AccidentReason =
  /** Write-off, structural or integrity evidence — the hard floor case. */
  | 'structural-evidence'
  /** An accident is established (bar or disclosure) but its severity is not. */
  | 'severity-not-established'
  /** A below-`unknown` text claim was raised to `unknown` for want of VIN corroboration. */
  | 'uncorroborated-claim-floored'
  /** A below-`unknown` text claim admitted because a VIN check corroborates it. */
  | 'corroborated-minor-claim'
  /** The bar and the description disagree; resolved conservatively, both signals recorded. */
  | 'contradictory-signals';

/** Persisted with the evaluation explanation from phase 2 onward. Additive value object. */
export interface AccidentSeverity {
  bucket: AccidentBucket;
  evidence: AccidentEvidence[];
  /** Whether a VIN check backs a below-`unknown` verdict (`risk.vinChecked || hasVinReport`). */
  corroborated: boolean;
  reason: AccidentReason;
}

/**
 * Versioned marker lists, loaded from `config/heuristics/accident-severity.json` (FR-009, ADR-0005
 * mechanics). `disclosure` says *an accident happened*, not *how bad* — it is the list that
 * «після дтп» / «после дтп» moved into, which is the specific defect this spec fixes.
 */
export interface AccidentSeverityLexicon {
  version: string;
  severe: string[];
  moderate: string[];
  cosmetic: string[];
  disclosure: string[];
}

/** The subset of `ListingRisk` this classifier reads. Kept structural so callers need no adapter. */
export interface AccidentSeverityInput {
  description?: string;
  damaged?: boolean;
  salvage?: boolean;
  vinChecked?: boolean;
  hasVinReport?: boolean;
}

/**
 * Preceding-negation / already-done markers that flip a phrase to harmless. Mirrors condition.ts so
 * «не був у ДТП», «без ДТП» and «не бита, не крашена» fire nothing (FR-010).
 */
const NEGATION = /(^|[^а-яёіїєґ'])(не|без|після|после)\s*$/;

/** Every un-negated occurrence from `phrases`, in lexicon order. Guarded like condition.ts. */
function matchGuarded(text: string, phrases: string[]): string[] {
  const hits: string[] = [];
  for (const phrase of phrases) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(phrase, from);
      if (i < 0) break;
      const before = text.slice(Math.max(0, i - 16), i);
      if (!NEGATION.test(before)) {
        hits.push(phrase);
        break; // one un-negated occurrence is enough; don't list the same marker twice
      }
      from = i + phrase.length;
    }
  }
  return hits;
}

/**
 * Classifies accident severity, or returns `null` when nothing indicates an accident at all — a
 * clean bar and a description with no un-negated marker.
 */
export function assessAccidentSeverity(
  input: AccidentSeverityInput,
  lexicon: AccidentSeverityLexicon,
): AccidentSeverity | null {
  const corroborated = input.vinChecked === true || input.hasVinReport === true;
  const text = (input.description ?? '').toLowerCase();

  // --- Bar verdict. Salvage is a write-off; `damaged` alone says nothing about how bad. ---
  const barEvidence: AccidentEvidence[] = [];
  let barBucket: AccidentBucket | null = null;
  if (input.salvage === true) {
    barEvidence.push({ marker: 'salvage', source: 'bar' });
    barBucket = 'severe';
  }
  if (input.damaged === true) {
    barEvidence.push({ marker: 'damaged', source: 'bar' });
    barBucket = barBucket ?? 'unknown';
  }

  // --- Text verdict. Severe is matched first; disclosure never yields a bucket on its own. ---
  const severeHits = matchGuarded(text, lexicon.severe);
  const moderateHits = matchGuarded(text, lexicon.moderate);
  const cosmeticHits = matchGuarded(text, lexicon.cosmetic);
  const disclosureHits = matchGuarded(text, lexicon.disclosure);

  const textEvidence: AccidentEvidence[] = [
    ...severeHits,
    ...moderateHits,
    ...cosmeticHits,
    ...disclosureHits,
  ].map((marker) => ({ marker, source: 'text' as const }));

  let textBucket: AccidentBucket | null = null;
  if (severeHits.length > 0) textBucket = 'severe';
  else if (moderateHits.length > 0) textBucket = 'moderate';
  else if (cosmeticHits.length > 0) textBucket = 'cosmetic';
  else if (disclosureHits.length > 0) textBucket = 'unknown'; // an accident happened; severity unstated

  if (barBucket === null && textBucket === null) return null;

  // --- The floor (FR-003). Not a weight: a discount cannot out-earn it, however deep. ---
  const floored = textBucket !== null && isBelowUnknown(textBucket) && !corroborated;
  const admittedTextBucket: AccidentBucket | null = floored ? 'unknown' : textBucket;

  // --- Resolution: max(bar, text). Severe is top-ranked, so it is terminal by construction. ---
  const candidates = [barBucket, admittedTextBucket].filter((b): b is AccidentBucket => b !== null);
  const bucket = candidates.reduce((a, b) => (RANK[a] >= RANK[b] ? a : b));

  return {
    bucket,
    evidence: [...barEvidence, ...textEvidence],
    corroborated,
    reason: resolveReason({ bucket, floored, barBucket, textBucket, corroborated }),
  };
}

function resolveReason(ctx: {
  bucket: AccidentBucket;
  floored: boolean;
  barBucket: AccidentBucket | null;
  textBucket: AccidentBucket | null;
  corroborated: boolean;
}): AccidentReason {
  if (ctx.bucket === 'severe') return 'structural-evidence';
  if (ctx.floored) return 'uncorroborated-claim-floored';
  // The bar says damaged and the description denies it (or describes nothing) — resolve up, and
  // keep both signals in the evidence list rather than picking a winner.
  if (ctx.barBucket !== null && ctx.textBucket === null) {
    return ctx.bucket === 'unknown' ? 'severity-not-established' : 'contradictory-signals';
  }
  if (isBelowUnknown(ctx.bucket) && ctx.corroborated) return 'corroborated-minor-claim';
  return 'severity-not-established';
}
