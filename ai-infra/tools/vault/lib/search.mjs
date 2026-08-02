/**
 * Retrieval layers L2/L3: find (locate) and show (fetch one section).
 *
 * Design notes that are load-bearing:
 *
 *  - This module parses notes LIVE rather than reading _gen/index.json. 25 small
 *    files is ~20ms, and a live parse cannot go stale. index.json is emitted by
 *    render.mjs purely as an artifact for external consumers; having search read
 *    it would create a second code path and a staleness class for no gain.
 *
 *  - Ref resolution never REQUIRES the literal Ukrainian heading. Positional
 *    (`Data Model#5`) and substring (`Data Model#crypto`) forms exist so an agent
 *    never has to emit `↔` or `—` into a shell argument — this sidesteps the
 *    Windows argument-encoding hazard rather than mitigating it.
 *
 *  - Prefix matching at >=3 chars replaces a stemmer. Ukrainian is heavily
 *    inflected (метчинг/метчингу/метчингом); prefix matching captures ~90% of
 *    that for free and a real stemmer would be a dependency and a bug farm.
 */
import * as path from 'node:path';
import { VAULT_DIR, GEN_DIR, readText, readTextOrNull, cmp, sortBy, norm } from './fs.mjs';
import { loadNotes } from './notes.mjs';
import { logEvent } from './log.mjs';

const DEFAULT_MAX_LINES = 120;

// ---------------------------------------------------------------- tokenizing

/** Split on anything that is not a letter/digit/underscore — correctly treats
 *  `—`, `↔`, `’`, `/`, `(` as separators without enumerating them. */
export function tokenize(text) {
  const out = [];
  for (const tok of norm(String(text)).toLocaleLowerCase('uk').split(/[^\p{L}\p{N}_]+/u)) {
    if (tok.length >= 2) out.push(tok);
    // snake_case identifiers must also be findable by their parts, or a query
    // for "purchase" can never reach a `crypto_purchases` heading.
    if (tok.includes('_')) for (const part of tok.split('_')) if (part.length >= 2) out.push(part);
  }
  return out;
}

let synonymCache = null;

function loadSynonyms(root) {
  if (synonymCache) return synonymCache;
  const raw = readTextOrNull(path.resolve(root, 'tools/vault/synonyms.tsv'));
  const map = new Map();
  if (raw) {
    for (const line of raw.split('\n')) {
      if (!line.trim() || line.startsWith('#')) continue;
      const parts = line.split('\t').map((s) => s.trim().toLocaleLowerCase('uk')).filter(Boolean);
      // Bidirectional: every token on the row expands to every other token.
      for (const tok of parts) {
        const set = map.get(tok) || new Set();
        for (const other of parts) if (other !== tok) set.add(other);
        map.set(tok, set);
      }
    }
  }
  synonymCache = map;
  return map;
}

/** Expand query tokens through the synonym table (one hop, no transitive closure). */
function expandQuery(root, tokens) {
  const syn = loadSynonyms(root);
  const out = new Map(); // token -> isOriginal
  for (const t of tokens) {
    out.set(t, true);
    // Exact key, then prefix either way (>=4 chars). Without the prefix pass an
    // English plural ("migrations") never reaches a row keyed on the singular
    // ("migration") — the same inflection problem as Ukrainian, mirrored.
    const keys = syn.has(t)
      ? [t]
      : [...syn.keys()].filter((k) => (k.length >= 4 && t.startsWith(k)) || (t.length >= 4 && k.startsWith(t)));
    for (const k of keys) for (const e of syn.get(k) || []) if (!out.has(e)) out.set(e, false);
  }
  return out;
}

// ------------------------------------------------------------------ scoring

const W = { name: 10, heading: 8, fact: 7, summary: 6, body: 2 };
const BODY_HIT_CAP = 3;
const SYNONYM_DISCOUNT = 0.75;
const PREFIX_DISCOUNT = 0.6;
const MIN_PREFIX = 3;
// Floor below which a hit is noise, not a weak answer. A single exact name
// token on a 3-word query scores ~1.1 (10 x coverage (1/3)^2), so this keeps
// legitimate partial matches while cutting the long tail. Without it `find`
// never returns empty, so a miss can never be observed — and the whole point
// of the log is to observe misses.
const MIN_SCORE = 1.0;

/** Score one query token against a bag of index tokens. Exact hit = 1,
 *  prefix hit = 0.6, else 0.
 *
 *  BOTH sides need the length floor. Requiring it only on the query token let
 *  a 2-char bag token ("no", from "no match") prefix-match any query word
 *  beginning with those letters, which meant every garbage query still
 *  returned hits. */
function tokenHit(queryToken, bag) {
  if (bag.has(queryToken)) return 1;
  if (queryToken.length >= MIN_PREFIX) {
    for (const t of bag) {
      if (t.length < MIN_PREFIX) continue;
      if (t.startsWith(queryToken) || queryToken.startsWith(t)) return PREFIX_DISCOUNT;
    }
  }
  return 0;
}

function bagOf(text) {
  return new Set(tokenize(text));
}

/**
 * Per-note token bags, memoized on the note object.
 *
 * `retrieval-regression` runs every row of `_retrieval.tsv` through `rank()`
 * inside the pre-commit hook — ~15 queries x 25 notes, each of which used to
 * re-tokenize the entire note body and every heading. The notes array is
 * loaded once per process, so keying on the note object gives a hit for every
 * query after the first. A WeakMap means a reload (new objects) transparently
 * invalidates.
 */
const bagCache = new WeakMap();

function bagsOf(note, factKeys) {
  let bags = bagCache.get(note);
  if (!bags) {
    bags = {
      name: bagOf(`${note.name} ${note.rel}`),
      summary: bagOf(note.data?.summary || ''),
      body: bagOf(note.body),
      fact: bagOf(factKeys.join(' ')),
      headings: note.headings.map((h) => bagOf(h.text)),
    };
    bagCache.set(note, bags);
  }
  return bags;
}

function loadFactKeys(root) {
  const raw = readTextOrNull(path.resolve(root, VAULT_DIR, '_facts.tsv'));
  const rows = [];
  if (raw) {
    for (const line of raw.split('\n')) {
      if (!line.trim() || line.startsWith('#')) continue;
      const [key, owner] = line.split('\t').map((s) => (s || '').trim());
      if (key && owner) rows.push({ key, owner });
    }
  }
  return rows;
}

/**
 * Rank notes and headings for a query.
 * Returns [{ note, headingIndex|null, score, why }] sorted by descending score.
 */
export function rank(root, notes, query, limit = 8) {
  const qTokens = tokenize(query);
  if (!qTokens.length) return [];
  const expanded = expandQuery(root, qTokens);
  const facts = loadFactKeys(root);

  const results = [];

  for (const note of notes) {
    const factKeys = facts.filter((f) => f.owner.split('#')[0] === note.rel).map((f) => f.key);
    const bags = bagsOf(note, factKeys);
    const { name: nameBag, summary: summaryBag, body: bodyBag, fact: factBag } = bags;

    // ---- note-level score
    let noteScore = 0;
    let bodyScore = 0;
    const matched = new Set();
    for (const [tok, isOriginal] of expanded) {
      const weightMul = isOriginal ? 1 : SYNONYM_DISCOUNT;
      let best = 0;
      best = Math.max(best, tokenHit(tok, nameBag) * W.name);
      best = Math.max(best, tokenHit(tok, factBag) * W.fact);
      best = Math.max(best, tokenHit(tok, summaryBag) * W.summary);
      const bodyHit = tokenHit(tok, bodyBag);
      if (best > 0 || bodyHit > 0) matched.add(tok);
      noteScore += best * weightMul;
      bodyScore += bodyHit * W.body * weightMul;
    }
    // The body cap is PER NOTE, not per token. Capping per token let mere
    // body presence contribute as much as a curated summary for every term,
    // which drowned the heading-level refs that make L3 retrieval cheap.
    noteScore += Math.min(bodyScore, W.body * BODY_HIT_CAP);

    // Notes matching ALL query terms must beat notes matching one term loudly.
    const originals = [...expanded].filter(([, o]) => o).map(([t]) => t);
    const matchedOriginals = originals.filter((t) => matched.has(t)).length;
    const coverage = originals.length ? (matchedOriginals / originals.length) ** 2 : 0;
    noteScore *= coverage;

    if (noteScore > 0) results.push({ note, headingIndex: null, score: noteScore });

    // ---- heading-level score (these are the L3 addresses we actually want)
    note.headings.forEach((h, i) => {
      if (h.level < 2) return; // H1 is the note title, already covered
      const hBag = bags.headings[i];
      let hs = 0;
      const hMatched = new Set();
      for (const [tok, isOriginal] of expanded) {
        const hit = tokenHit(tok, hBag);
        if (hit) {
          hs += hit * W.heading * (isOriginal ? 1 : SYNONYM_DISCOUNT);
          hMatched.add(tok);
        }
      }
      if (!hs) return;
      const hCov = originals.length ? (originals.filter((t) => hMatched.has(t)).length / originals.length) ** 2 : 0;
      // A heading hit inherits a fraction of its note's relevance so that the
      // right heading in the right note outranks a coincidental heading elsewhere.
      const total = hs * Math.max(hCov, 0.25) + noteScore * 0.35;
      if (total > 0) results.push({ note, headingIndex: i, score: total });
    });
  }

  return results
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || cmp(a.note.rel, b.note.rel) || (a.headingIndex ?? -1) - (b.headingIndex ?? -1))
    .slice(0, limit);
}

// --------------------------------------------------------- ref resolution

export class RefError extends Error {
  constructor(message, candidates = []) {
    super(message);
    this.candidates = candidates;
  }
}

function normHeading(text) {
  return norm(text)
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]*))?\]\]/g, (_, t, a) => a || t)
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('uk');
}

/** Resolve a note by basename: exact -> case-insensitive -> unique substring. */
export function resolveNote(notes, spec) {
  const want = norm(spec).trim();
  let hit = notes.filter((n) => n.name === want);
  if (hit.length === 1) return hit[0];

  const lower = want.toLocaleLowerCase('uk');
  hit = notes.filter((n) => n.name.toLocaleLowerCase('uk') === lower);
  if (hit.length === 1) return hit[0];

  hit = notes.filter((n) => n.name.toLocaleLowerCase('uk').includes(lower) || n.rel.toLocaleLowerCase('uk').includes(lower));
  if (hit.length === 1) return hit[0];
  if (hit.length > 1) throw new RefError(`ambiguous note '${spec}'`, hit.map((n) => n.rel));
  throw new RefError(`no note matches '${spec}'`, sortBy(notes.map((n) => n.rel)));
}

/**
 * Resolve `Note#anchor`. Precedence, first unique hit wins:
 *   1. exact literal heading (case-sensitive)
 *   2. exact normalized (formatting stripped, lowercased)
 *   3. positional — `#5` = 5th H2/H3
 *   4. substring
 * Ambiguity throws with the note's numbered heading list, which is itself a
 * useful ~8-line output for the caller.
 */
export function resolveRef(notes, ref) {
  const hashAt = ref.indexOf('#');
  const noteSpec = hashAt === -1 ? ref : ref.slice(0, hashAt);
  const anchor = hashAt === -1 ? null : ref.slice(hashAt + 1).trim();
  const note = resolveNote(notes, noteSpec);
  if (!anchor) return { note, headingIndex: null };

  const addressable = note.headings.map((h, i) => ({ h, i })).filter(({ h }) => h.level >= 2);

  let hit = addressable.filter(({ h }) => h.text === anchor);
  if (hit.length === 1) return { note, headingIndex: hit[0].i };

  const wantNorm = normHeading(anchor);
  hit = addressable.filter(({ h }) => normHeading(h.text) === wantNorm);
  if (hit.length === 1) return { note, headingIndex: hit[0].i };

  if (/^\d+$/.test(anchor)) {
    const idx = Number(anchor) - 1;
    if (idx >= 0 && idx < addressable.length) return { note, headingIndex: addressable[idx].i };
    throw new RefError(`'${note.name}' has ${addressable.length} addressable headings, asked for #${anchor}`, headingList(note));
  }

  hit = addressable.filter(({ h }) => normHeading(h.text).includes(wantNorm));
  if (hit.length === 1) return { note, headingIndex: hit[0].i };
  if (hit.length > 1) {
    throw new RefError(`ambiguous anchor '${anchor}' in '${note.name}'`, hit.map(({ h, i }) => `#${addressable.findIndex((a) => a.i === i) + 1} ${h.text}`));
  }
  throw new RefError(`no heading matches '${anchor}' in '${note.name}'`, headingList(note));
}

function headingList(note) {
  return note.headings
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.level >= 2)
    .map(({ h }, n) => `#${n + 1} ${h.text}`);
}

// ------------------------------------------------------------------ commands

function summaryOf(note) {
  return note.data?.summary || '(no summary — run vault build --seed-frontmatter)';
}

export function find(root, query, flags = {}) {
  const notes = loadNotes(root);
  const limit = Number(flags.n || 8);
  const hits = rank(root, notes, query, limit);

  if (!hits.length) {
    // A miss is the single most actionable signal the log carries: it names a
    // vocabulary gap between how agents ask and how the vault is written.
    logEvent(root, { cmd: 'find', arg: query, outcome: 'miss', detail: '' });
    process.stderr.write(`vault find: no match for '${query}'\n`);
    return 1;
  }

  const top = hits[0];
  logEvent(root, {
    cmd: 'find',
    arg: query,
    outcome: 'hit',
    detail: `n=${hits.length} top=${top.headingIndex === null ? top.note.rel : `${top.note.rel}#${headingNumber(top.note, top.headingIndex)}`}`,
  });

  if (flags.json) {
    process.stdout.write(
      JSON.stringify(
        hits.map((r) => ({
          ref: r.headingIndex === null ? r.note.rel : `${r.note.name}#${headingNumber(r.note, r.headingIndex)}`,
          path: r.note.path,
          heading: r.headingIndex === null ? null : r.note.headings[r.headingIndex].text,
          line: r.headingIndex === null ? 1 : r.note.headings[r.headingIndex].line,
          score: Math.round(r.score * 100) / 100,
        })),
        null,
        2,
      ) + '\n',
    );
    return 0;
  }

  // One line per hit, no prose, no blank lines: ~12-18 tokens each.
  const out = [];
  for (const r of hits) {
    if (r.headingIndex === null) {
      out.push(`${r.note.rel} :: note — ${summaryOf(r.note)}`);
    } else {
      const h = r.note.headings[r.headingIndex];
      out.push(`${r.note.rel}#${headingNumber(r.note, r.headingIndex)} :: ${h.text}`);
    }
  }
  process.stdout.write(out.join('\n') + '\n');
  return 0;
}

function headingNumber(note, headingIndex) {
  const addressable = note.headings.map((h, i) => ({ h, i })).filter(({ h }) => h.level >= 2);
  return addressable.findIndex((a) => a.i === headingIndex) + 1;
}

export function show(root, ref, flags = {}) {
  const notes = loadNotes(root);
  let resolved;
  try {
    resolved = resolveRef(notes, ref);
  } catch (err) {
    if (err instanceof RefError) {
      logEvent(root, {
        cmd: 'show',
        arg: ref,
        outcome: /ambiguous/.test(err.message) ? 'ambiguous' : 'miss',
        detail: err.message,
      });
      process.stderr.write(`vault show: ${err.message}\n`);
      if (err.candidates.length) process.stderr.write(err.candidates.slice(0, 40).join('\n') + '\n');
      return 2;
    }
    throw err;
  }
  const { text, truncated, remaining, title } = renderSection(resolved, flags);
  logEvent(root, {
    cmd: 'show',
    arg: ref,
    outcome: truncated ? 'truncated' : 'ok',
    detail: truncated ? `${title} +${remaining} lines` : title,
  });
  process.stdout.write(text);
  return 0;
}

/**
 * Render one section. Returns stats alongside the text because `truncated` is
 * the log's proxy for an L3->L4 escalation — the caller has to be able to see
 * it without re-parsing the output.
 */
function renderSection({ note, headingIndex }, flags = {}) {
  const maxLines = Number(flags['max-lines'] || DEFAULT_MAX_LINES);
  let startLine, endLine, title;

  if (headingIndex === null) {
    startLine = note.bodyStartLine;
    endLine = note.lines.length;
    title = `${note.rel} :: (whole note)`;
  } else {
    const h = note.headings[headingIndex];
    startLine = h.line;
    endLine = h.endLine;
    title = `${note.rel}#${headingNumber(note, headingIndex)} :: ${h.text}`;
  }

  const all = note.lines.slice(startLine - 1, endLine);
  const shown = all.slice(0, maxLines);
  const parts = [title];
  if (flags.ctx) parts.push(`summary: ${summaryOf(note)}`);
  parts.push(shown.join('\n').replace(/\s+$/, ''));

  const remaining = all.length - shown.length;
  if (remaining > 0) {
    const nextLine = startLine + shown.length;
    // This footer is what makes L3->L4 escalation ONE precise partial Read
    // instead of a full-file Read.
    parts.push(`[truncated, ${remaining} more lines: Read ${note.path} offset=${nextLine} limit=${remaining}]`);
  }

  if (flags.links) {
    const outbound = note.links.filter((l) => l.line >= startLine && l.line <= endLine).map((l) => l.target);
    if (outbound.length) parts.push(`links: ${sortBy([...new Set(outbound)]).join(', ')}`);
  }

  return { text: parts.join('\n') + '\n', title, truncated: remaining > 0, remaining };
}

/**
 * L1 + L3 in a single call: the context pack plus named sections.
 * This is the mechanism for cross-agent context retention — a parent passes
 * refs, the child runs one `brief` instead of L1 + N x L3.
 */
export function brief(root, refs, flags = {}) {
  const ctxPath = path.resolve(root, GEN_DIR, 'context.txt');
  const ctx = readTextOrNull(ctxPath);
  if (ctx === null) {
    process.stderr.write(`vault brief: ${GEN_DIR}/context.txt missing — run: npm run vault:build\n`);
    return 2;
  }
  process.stdout.write(ctx.replace(/\s+$/, '') + '\n');
  if (!refs.length) return 0;

  const notes = loadNotes(root);
  let code = 0;
  for (const ref of refs) {
    process.stdout.write('\n' + '-'.repeat(60) + '\n');
    try {
      const { text, truncated, remaining, title } = renderSection(resolveRef(notes, ref), flags);
      logEvent(root, {
        cmd: 'brief',
        arg: ref,
        outcome: truncated ? 'truncated' : 'ok',
        detail: truncated ? `${title} +${remaining} lines` : title,
      });
      process.stdout.write(text);
    } catch (err) {
      if (err instanceof RefError) {
        logEvent(root, {
          cmd: 'brief',
          arg: ref,
          outcome: /ambiguous/.test(err.message) ? 'ambiguous' : 'miss',
          detail: err.message,
        });
        process.stderr.write(`vault brief: ${err.message}\n`);
        code = 2;
      } else throw err;
    }
  }
  return code;
}

export function dumpMap(root) {
  const p = path.resolve(root, GEN_DIR, 'map.tsv');
  const raw = readTextOrNull(p);
  if (raw === null) {
    process.stderr.write(`vault map: ${GEN_DIR}/map.tsv missing — run: npm run vault:build\n`);
    return 2;
  }
  process.stdout.write(raw);
  return 0;
}
