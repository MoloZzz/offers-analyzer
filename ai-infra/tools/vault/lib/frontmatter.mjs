/**
 * Hand-rolled YAML frontmatter parser/serializer for vault notes.
 *
 * This is deliberately NOT a general YAML parser. The schema is closed to
 * exactly three keys (summary, code, rev) and the value grammar is a small,
 * strict subset chosen so that what Obsidian's properties pane shows never
 * silently diverges from what this tool reads. Anything ambiguous is a hard
 * parse error rather than a guess.
 */

const ALLOWED_KEYS = new Set(['summary', 'code', 'rev']);

// YAML indicator characters that make a *value* ambiguous if left unquoted:
// flow collections ([ {), anchors/aliases (& *), tags (!), directives (%),
// reserved (@ `), explicit key (?), block scalars (> |), block sequence (-),
// and stray quote characters (" ') that did not open a well-formed quoted
// scalar. An unquoted value starting with any of these is rejected outright
// instead of being (mis)interpreted.
const BAD_LEADING_CHARS = new Set(['[', '{', '*', '&', '!', '%', '@', '`', '?', '>', '|', '-', '"', "'"]);

const REV_RE = /^[0-9a-f]{12}$/;

export class FrontmatterError extends Error {
  /**
   * @param {string} message ASCII-only prefix; any offending non-ASCII text
   *   must be appended by the caller as a quoted suffix, never embedded in
   *   the leading message itself (a pre-commit hook prints this raw under
   *   the OEM codepage, which mangles anything beyond ASCII).
   * @param {number|null} line 1-based line number the error applies to.
   */
  constructor(message, line = null) {
    super(line != null ? `${message} (line ${line})` : message);
    this.name = 'FrontmatterError';
    this.line = line;
  }
}

/** Trim, then decode a single scalar value per the closed grammar (throws on ambiguity). */
function parseScalar(raw, lineNo) {
  const value = raw.trim();
  if (value.startsWith('"')) return parseDoubleQuoted(value, lineNo);
  return parseUnquoted(value, lineNo);
}

function parseDoubleQuoted(value, lineNo) {
  if (value.length < 2 || !value.endsWith('"')) {
    throw new FrontmatterError('unterminated double-quoted scalar', lineNo);
  }
  const inner = value.slice(1, -1);
  let out = '';
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '\\') {
      const next = inner[i + 1];
      if (next === '"' || next === '\\') {
        out += next;
        i++;
      } else {
        throw new FrontmatterError(
          `unsupported escape sequence in double-quoted scalar: '\\${next ?? ''}'`,
          lineNo,
        );
      }
    } else if (c === '"') {
      // An unescaped quote before the final character means the "closing"
      // quote we matched above was not actually the end of the scalar.
      throw new FrontmatterError('unexpected unescaped \'"\' inside double-quoted scalar', lineNo);
    } else {
      out += c;
    }
  }
  return out;
}

function parseUnquoted(value, lineNo) {
  if (value.includes(' #')) {
    throw new FrontmatterError(`unquoted scalar contains a YAML comment, quote the value: '${value}'`, lineNo);
  }
  const first = value[0];
  if (first !== undefined && BAD_LEADING_CHARS.has(first)) {
    throw new FrontmatterError(
      `unquoted scalar starts with unsupported character '${first}', quote the value: '${value}'`,
      lineNo,
    );
  }
  return value;
}

/** `code: [a, "b, c"]` — deliberately minimal, mirrors fs.mjs's expandPatterns philosophy. */
function parseInlineList(value, lineNo) {
  if (!value.startsWith('[') || !value.endsWith(']')) {
    throw new FrontmatterError(`malformed inline list: '${value}'`, lineNo);
  }
  const inner = value.slice(1, -1).trim();
  if (inner === '') return [];

  const rawItems = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      cur += c;
    } else if (c === ',' && !inQuotes) {
      rawItems.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  rawItems.push(cur);
  return rawItems.map((raw) => parseScalar(raw, lineNo));
}

const LIST_ITEM_RE = /^ {2}- /;

/**
 * Parse frontmatter + body out of `text`.
 *
 * Frontmatter exists ONLY if line 1 is exactly `---`; the FIRST subsequent
 * `---` line closes it. This never scans past that first close — a note
 * body is free to use `---` as a horizontal rule anywhere after it.
 *
 * @returns {{ data: object, body: string, bodyStartLine: number, hasFrontmatter: boolean }}
 */
export function parse(text) {
  const lines = text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));

  if (lines[0] !== '---') {
    return { data: {}, body: text, bodyStartLine: 1, hasFrontmatter: false };
  }

  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) {
    throw new FrontmatterError("unterminated frontmatter block: no closing '---' found", 1);
  }

  const data = {};
  let i = 1;
  while (i < closeIdx) {
    const line = lines[i];
    const lineNo = i + 1;

    if (line.trim() === '') {
      i++;
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      throw new FrontmatterError("malformed frontmatter line, expected 'key: value'", lineNo);
    }
    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1);

    if (!ALLOWED_KEYS.has(key)) {
      throw new FrontmatterError(`unknown frontmatter key '${key}'`, lineNo);
    }

    if (key === 'code') {
      const trimmedVal = rawValue.trim();
      if (trimmedVal === '') {
        const items = [];
        let j = i + 1;
        while (j < closeIdx && LIST_ITEM_RE.test(lines[j])) {
          items.push(parseScalar(lines[j].slice(4), j + 1));
          j++;
        }
        data.code = items;
        i = j;
      } else if (trimmedVal.startsWith('[')) {
        data.code = parseInlineList(trimmedVal, lineNo);
        i++;
      } else {
        throw new FrontmatterError("'code' must be a YAML list (block form or inline '[...]')", lineNo);
      }
      continue;
    }

    data[key] = parseScalar(rawValue, lineNo);
    i++;
  }

  if (typeof data.summary !== 'string') {
    throw new FrontmatterError("frontmatter requires a 'summary' key", closeIdx + 1);
  }
  if (data.rev !== undefined && !REV_RE.test(data.rev)) {
    throw new FrontmatterError(`'rev' must be exactly 12 hex characters, got '${data.rev}'`, closeIdx + 1);
  }

  const bodyLines = lines.slice(closeIdx + 1);
  return {
    data,
    body: bodyLines.join('\n'),
    bodyStartLine: closeIdx + 2,
    hasFrontmatter: true,
  };
}

/** Quote a scalar iff leaving it bare would hit one of parseUnquoted's hard-fail rules. */
function needsQuoting(value) {
  if (value.includes(' #')) return true;
  const first = value[0];
  return first !== undefined && BAD_LEADING_CHARS.has(first);
}

function formatScalar(value) {
  if (typeof value !== 'string') {
    throw new FrontmatterError(`scalar value must be a string, got ${typeof value}`);
  }
  if (needsQuoting(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

/**
 * Serialize `data` (closed schema: summary, code, rev) as a `---`-delimited
 * frontmatter block, followed verbatim by `body`. Keys are always emitted in
 * the fixed order summary, code, rev. Guaranteed inverse of parse(): for any
 * text produced by this function, `serialize(parse(text).data, parse(text).body) === text`.
 */
export function serialize(data, body) {
  for (const key of Object.keys(data)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new FrontmatterError(`unknown frontmatter key '${key}'`);
    }
  }
  if (typeof data.summary !== 'string') {
    throw new FrontmatterError("frontmatter requires a string 'summary'");
  }
  if (data.code !== undefined && !Array.isArray(data.code)) {
    throw new FrontmatterError("'code' must be an array of strings");
  }
  if (data.rev !== undefined && !REV_RE.test(data.rev)) {
    throw new FrontmatterError(`'rev' must be exactly 12 hex characters, got '${data.rev}'`);
  }

  const lines = ['---', `summary: ${formatScalar(data.summary)}`];
  if (data.code !== undefined) {
    if (data.code.length === 0) {
      lines.push('code: []');
    } else {
      lines.push('code:');
      for (const item of data.code) lines.push(`  - ${formatScalar(item)}`);
    }
  }
  if (data.rev !== undefined) {
    lines.push(`rev: ${formatScalar(data.rev)}`);
  }
  lines.push('---');

  return `${lines.join('\n')}\n${body}`;
}
