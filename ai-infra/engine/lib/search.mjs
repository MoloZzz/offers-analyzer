/** Read-only L2/L3 retrieval over curated vault notes. */
import * as path from 'node:path';
import { cmp, norm, readTextOrNull, sortBy } from './fs.mjs';
import { resolveNoteReference } from './graph.mjs';
import { loadNotes } from './notes.mjs';

const DEFAULT_MAX_LINES = 120;
const DEFAULT_LIMIT = 8;
const MIN_PREFIX = 3;
const MIN_SCORE = 1;

export class RefError extends Error {
  constructor(message, candidates = []) {
    super(message);
    this.name = 'RefError';
    this.candidates = candidates;
  }
}

function lower(value, locale = 'en') {
  return norm(String(value)).toLocaleLowerCase(locale);
}

export function tokenize(text, locale = 'en') {
  const tokens = [];
  for (const token of lower(text, locale).split(/[^\p{L}\p{N}_]+/u)) {
    if (token.length >= 2) tokens.push(token);
    if (token.includes('_'))
      for (const part of token.split('_')) if (part.length >= 2) tokens.push(part);
  }
  return tokens;
}

const synonymCache = new Map();

function synonyms(root, config) {
  if (!config.synonymsFile) return new Map();
  const file = path.resolve(root, config.synonymsFile);
  const cacheKey = `${file}\0${config.locale}`;
  const cached = synonymCache.get(cacheKey);
  if (cached) return cached;
  const map = new Map();
  const source = readTextOrNull(file);
  if (source) {
    for (const line of source.split('\n')) {
      if (!line.trim() || line.trimStart().startsWith('#')) continue;
      const group = line
        .split('\t')
        .map((item) => lower(item.trim(), config.locale))
        .filter(Boolean);
      for (const token of group) {
        const related = map.get(token) || new Set();
        for (const other of group) if (other !== token) related.add(other);
        map.set(token, related);
      }
    }
  }
  synonymCache.set(cacheKey, map);
  return map;
}

function expandQuery(root, config, originalTokens) {
  const map = synonyms(root, config);
  const expanded = new Map();
  for (const token of originalTokens) {
    expanded.set(token, true);
    const candidates = map.has(token)
      ? [token]
      : [...map.keys()].filter(
          (candidate) =>
            candidate.length >= 4 &&
            token.length >= 4 &&
            (candidate.startsWith(token) || token.startsWith(candidate)),
        );
    for (const candidate of candidates)
      for (const other of map.get(candidate) || [])
        if (!expanded.has(other)) expanded.set(other, false);
  }
  return expanded;
}

function bag(text, locale) {
  return new Set(tokenize(text, locale));
}
function literalOccurrences(text, wanted, locale) {
  if (!wanted) return 0;
  const haystack = lower(text, locale);
  let from = 0;
  let count = 0;
  for (;;) {
    const at = haystack.indexOf(wanted, from);
    if (at === -1) return count;
    count++;
    from = at + wanted.length;
  }
}
function isIdentifierQuery(query) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(query) && /[A-Z_]/.test(query);
}
function tokenHit(token, tokens) {
  if (tokens.has(token)) return 1;
  if (token.length < MIN_PREFIX) return 0;
  for (const candidate of tokens)
    if (
      candidate.length >= MIN_PREFIX &&
      (candidate.startsWith(token) || token.startsWith(candidate))
    )
      return 0.6;
  return 0;
}
function noteBags(note, locale) {
  return {
    address: bag(`${note.name} ${note.rel} ${note.title}`, locale),
    summary: bag(note.data.summary || '', locale),
    body: bag(note.body, locale),
    headings: note.headings.map((heading) => bag(heading.text, locale)),
  };
}

/** Rank notes and addressable headings without ever consulting context/. */
export function rank(root, config, notes, query, limit = DEFAULT_LIMIT) {
  const locale = config.locale || 'en';
  const original = tokenize(query, locale);
  if (!original.length) return [];
  const terms = expandQuery(root, config, original);
  const literal = lower(String(query).trim(), locale);
  const identifier = isIdentifierQuery(norm(String(query).trim()));
  const output = [];
  for (const note of notes) {
    const bags = noteBags(note, locale);
    let noteScore = 0;
    const matchedOriginal = new Set();
    for (const [term, isOriginal] of terms) {
      const factor = isOriginal ? 1 : 0.75;
      const address = tokenHit(term, bags.address);
      const summary = tokenHit(term, bags.summary);
      const body = tokenHit(term, bags.body);
      const best = Math.max(address * 10, summary * 6, body * 2);
      if (best) noteScore += best * factor;
      if (isOriginal && (address || summary || body)) matchedOriginal.add(term);
    }
    if (identifier) {
      noteScore +=
        literalOccurrences(`${note.name} ${note.rel} ${note.title}`, literal, locale) * 20;
      noteScore += literalOccurrences(note.data.summary || '', literal, locale) * 12;
      noteScore += literalOccurrences(note.body, literal, locale) * 6;
    }
    noteScore *= (matchedOriginal.size / original.length) ** 2;
    if (noteScore >= MIN_SCORE) output.push({ note, headingIndex: null, score: noteScore });
    note.headings.forEach((heading, index) => {
      if (heading.level < 2) return;
      let headingScore = 0;
      const matched = new Set();
      for (const [term, isOriginal] of terms) {
        const hit = tokenHit(term, bags.headings[index]);
        if (!hit) continue;
        headingScore += hit * 8 * (isOriginal ? 1 : 0.75);
        if (isOriginal) matched.add(term);
      }
      if (!headingScore) return;
      const total =
        headingScore * Math.max((matched.size / original.length) ** 2, 0.25) + noteScore * 0.35;
      if (total >= MIN_SCORE) output.push({ note, headingIndex: index, score: total });
    });
  }
  return output
    .sort(
      (left, right) =>
        right.score - left.score ||
        cmp(left.note.rel, right.note.rel) ||
        (left.headingIndex ?? -1) - (right.headingIndex ?? -1),
    )
    .slice(0, limit);
}

function normalizeHeading(value, locale) {
  return lower(value, locale)
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(
      /!?(?:\[\[)([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]*))?\]\]/g,
      (_match, target, alias) => alias || target,
    )
    .replace(/\s+/g, ' ')
    .trim();
}
function addressableHeadings(note) {
  return note.headings
    .map((heading, index) => ({ heading, index }))
    .filter(({ heading }) => heading.level >= 2);
}

function resolveLooseNote(notes, specification, locale) {
  const exact = resolveNoteReference(notes, specification, locale);
  if (exact?.note) return exact.note;
  if (exact?.ambiguous)
    throw new RefError(
      `ambiguous note '${specification}'`,
      exact.ambiguous.map((note) => note.rel),
    );
  const wanted = lower(specification.trim(), locale);
  const candidates = notes.filter((note) =>
    [note.name, note.rel, note.title].some((value) => lower(value, locale).includes(wanted)),
  );
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1)
    throw new RefError(
      `ambiguous note '${specification}'`,
      sortBy(candidates, (note) => note.rel).map((note) => note.rel),
    );
  throw new RefError(
    `no note matches '${specification}'`,
    sortBy(notes, (note) => note.rel).map((note) => note.rel),
  );
}

export function resolveRef(notes, reference, locale = 'en') {
  const hash = reference.indexOf('#');
  const noteSpec = (hash === -1 ? reference : reference.slice(0, hash)).trim();
  const anchor = hash === -1 ? '' : reference.slice(hash + 1).trim();
  if (!noteSpec) throw new RefError('reference needs a note name or path');
  const note = resolveLooseNote(notes, noteSpec, locale);
  if (!anchor) return { note, headingIndex: null };
  const headings = addressableHeadings(note);
  if (/^\d+$/.test(anchor)) {
    const position = Number(anchor) - 1;
    if (position >= 0 && position < headings.length)
      return { note, headingIndex: headings[position].index };
    throw new RefError(
      `'${note.rel}' has ${headings.length} addressable headings, asked for #${anchor}`,
      headingList(note),
    );
  }
  let matches = headings.filter(({ heading }) => heading.text === anchor);
  if (matches.length === 1) return { note, headingIndex: matches[0].index };
  const normalized = normalizeHeading(anchor, locale);
  matches = headings.filter(({ heading }) => normalizeHeading(heading.text, locale) === normalized);
  if (matches.length === 1) return { note, headingIndex: matches[0].index };
  matches = headings.filter(({ heading }) =>
    normalizeHeading(heading.text, locale).includes(normalized),
  );
  if (matches.length === 1) return { note, headingIndex: matches[0].index };
  if (matches.length > 1)
    throw new RefError(
      `ambiguous anchor '${anchor}' in '${note.rel}'`,
      matches.map(
        ({ heading, index }) =>
          `#${headings.findIndex((item) => item.index === index) + 1} ${heading.text}`,
      ),
    );
  throw new RefError(`no heading matches '${anchor}' in '${note.rel}'`, headingList(note));
}

function headingList(note) {
  return addressableHeadings(note).map(({ heading }, index) => `#${index + 1} ${heading.text}`);
}
function headingNumber(note, headingIndex) {
  return addressableHeadings(note).findIndex((item) => item.index === headingIndex) + 1;
}
function maxLines(flags) {
  const requested =
    flags['max-lines'] === undefined ? DEFAULT_MAX_LINES : Number(flags['max-lines']);
  if (!Number.isInteger(requested) || requested <= 0)
    throw new RefError('--max-lines must be a positive integer');
  return requested;
}

export function renderSection(resolved, flags = {}) {
  const { note, headingIndex } = resolved;
  const limit = maxLines(flags);
  const startLine = headingIndex === null ? note.bodyStartLine : note.headings[headingIndex].line;
  const endLine = headingIndex === null ? note.lines.length : note.headings[headingIndex].endLine;
  const title =
    headingIndex === null
      ? `${note.rel} :: whole note`
      : `${note.rel}#${headingNumber(note, headingIndex)} :: ${note.headings[headingIndex].text}`;
  const all = note.lines.slice(startLine - 1, endLine);
  const shown = all.slice(0, limit);
  const output = [title];
  if (flags.ctx && note.data.summary) output.push(`summary: ${note.data.summary}`);
  output.push(shown.join('\n').replace(/\s+$/, ''));
  const remaining = all.length - shown.length;
  if (remaining > 0)
    output.push(
      `[truncated, ${remaining} more lines: Read ${note.path} offset=${startLine + shown.length} limit=${remaining}]`,
    );
  if (flags.links) {
    const targets = note.links
      .filter((link) => link.line >= startLine && link.line <= endLine)
      .map((link) => link.target);
    if (targets.length) output.push(`links: ${sortBy([...new Set(targets)]).join(', ')}`);
  }
  return { text: `${output.join('\n')}\n`, title, truncated: remaining > 0, remaining };
}

function summary(note) {
  return note.data.summary || '(no summary)';
}

export function find(root, config, query, flags = {}) {
  const requested = flags.n === undefined ? DEFAULT_LIMIT : Number(flags.n);
  if (!Number.isInteger(requested) || requested <= 0) {
    process.stderr.write('vault find: -n must be a positive integer\n');
    return 2;
  }
  const hits = rank(root, config, loadNotes(root, config), query, requested);
  if (!hits.length) {
    process.stderr.write(`vault find: no match for '${query}'\n`);
    return 1;
  }
  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify(
        hits.map((hit) => ({
          ref:
            hit.headingIndex === null
              ? hit.note.rel
              : `${hit.note.rel}#${headingNumber(hit.note, hit.headingIndex)}`,
          path: hit.note.path,
          heading: hit.headingIndex === null ? null : hit.note.headings[hit.headingIndex].text,
          line:
            hit.headingIndex === null
              ? hit.note.bodyStartLine
              : hit.note.headings[hit.headingIndex].line,
          score: Math.round(hit.score * 100) / 100,
        })),
        null,
        2,
      )}\n`,
    );
    return 0;
  }
  process.stdout.write(
    hits
      .map((hit) =>
        hit.headingIndex === null
          ? `${hit.note.rel} :: note — ${summary(hit.note)}`
          : `${hit.note.rel}#${headingNumber(hit.note, hit.headingIndex)} :: ${hit.note.headings[hit.headingIndex].text}`,
      )
      .join('\n') + '\n',
  );
  return 0;
}

export function show(root, config, reference, flags = {}) {
  try {
    process.stdout.write(
      renderSection(resolveRef(loadNotes(root, config), reference, config.locale), flags).text,
    );
    return 0;
  } catch (error) {
    if (!(error instanceof RefError)) throw error;
    process.stderr.write(`vault show: ${error.message}\n`);
    if (error.candidates.length) process.stderr.write(`${error.candidates.join('\n')}\n`);
    return 2;
  }
}

export function brief(root, config, references, flags = {}) {
  const context = readTextOrNull(path.resolve(root, config.vaultDir, '_gen', 'context.txt'));
  if (context === null) {
    process.stderr.write(
      `vault brief: ${config.vaultDir}/_gen/context.txt is missing — run: ${config.engineCommand} build\n`,
    );
    return 2;
  }
  process.stdout.write(`${context.replace(/\s+$/, '')}\n`);
  if (!references.length) return 0;
  const notes = loadNotes(root, config);
  let code = 0;
  for (const reference of references) {
    process.stdout.write(`\n${'-'.repeat(60)}\n`);
    try {
      process.stdout.write(renderSection(resolveRef(notes, reference, config.locale), flags).text);
    } catch (error) {
      if (!(error instanceof RefError)) throw error;
      process.stderr.write(`vault brief: ${error.message}\n`);
      if (error.candidates.length) process.stderr.write(`${error.candidates.join('\n')}\n`);
      code = 2;
    }
  }
  return code;
}

export function dumpMap(root, config) {
  const map = readTextOrNull(path.resolve(root, config.vaultDir, '_gen', 'map.tsv'));
  if (map === null) {
    process.stderr.write(
      `vault map: ${config.vaultDir}/_gen/map.tsv is missing — run: ${config.engineCommand} build\n`,
    );
    return 2;
  }
  process.stdout.write(map);
  return 0;
}
