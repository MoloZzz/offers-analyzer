/** Small YAML-frontmatter reader for deliberately simple, hand-written notes. */
import { norm } from './fs.mjs';

const REV_RE = /^[0-9a-f]{12}$/;
const KEY_RE = /^([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]*(.*))?$/;

export class FrontmatterError extends Error {
  constructor(message, line = null) {
    super(line === null ? message : `${message} (line ${line})`);
    this.name = 'FrontmatterError';
    this.line = line;
  }
}

function scalar(raw, line) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (value.startsWith('"')) {
    if (value.length < 2 || !value.endsWith('"'))
      throw new FrontmatterError('unterminated double-quoted scalar', line);
    try {
      return JSON.parse(value);
    } catch {
      throw new FrontmatterError('invalid double-quoted scalar', line);
    }
  }
  if (value.startsWith("'")) {
    if (value.length < 2 || !value.endsWith("'"))
      throw new FrontmatterError('unterminated single-quoted scalar', line);
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value.replace(/\s+#.*$/, '').trim();
}

function inlineList(raw, line) {
  const value = raw.trim();
  if (!value.startsWith('[') || !value.endsWith(']'))
    throw new FrontmatterError("'code' must be a YAML list", line);
  const inside = value.slice(1, -1).trim();
  if (!inside) return [];
  const parts = [];
  let current = '';
  let quote = null;
  for (let index = 0; index < inside.length; index++) {
    const char = inside[index];
    if ((char === '"' || char === "'") && (index === 0 || inside[index - 1] !== '\\'))
      quote = quote === char ? null : quote || char;
    if (char === ',' && !quote) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  if (quote) throw new FrontmatterError("unterminated quoted list item in 'code'", line);
  parts.push(current);
  return parts.map((part) => scalar(part, line));
}

export function parseFrontmatter(source) {
  const text = norm(source);
  const lines = text.split('\n');
  if (lines[0] !== '---')
    return { hasFrontmatter: false, data: {}, body: text, bodyStartLine: 1, rawLines: [] };
  let close = -1;
  for (let index = 1; index < lines.length; index++)
    if (lines[index] === '---') {
      close = index;
      break;
    }
  if (close === -1)
    throw new FrontmatterError("unterminated frontmatter block: no closing '---' found", 1);
  const data = {};
  for (let index = 1; index < close; index++) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = line.match(KEY_RE);
    if (!match) {
      if (/^[ \t]+/.test(line)) continue;
      throw new FrontmatterError("malformed frontmatter line, expected 'key: value'", index + 1);
    }
    const [, key, rawValue = ''] = match;
    if (Object.hasOwn(data, key))
      throw new FrontmatterError(`duplicate frontmatter key '${key}'`, index + 1);
    if (key === 'code') {
      const trimmed = rawValue.trim();
      if (trimmed.startsWith('[')) {
        data.code = inlineList(trimmed, index + 1);
        continue;
      }
      if (trimmed) throw new FrontmatterError("'code' must be a YAML list", index + 1);
      const items = [];
      let next = index + 1;
      while (next < close && /^\s{2,}-\s+/.test(lines[next])) {
        items.push(scalar(lines[next].replace(/^\s{2,}-\s+/, ''), next + 1));
        next++;
      }
      data.code = items;
      index = next - 1;
      continue;
    }
    data[key] = scalar(rawValue, index + 1);
  }
  if (data.rev !== undefined && !REV_RE.test(data.rev))
    throw new FrontmatterError("'rev' must be exactly 12 lowercase hex characters", 1);
  if (
    data.code !== undefined &&
    !data.code.every((item) => typeof item === 'string' && item.trim())
  )
    throw new FrontmatterError("'code' items must be non-empty strings", 1);
  return {
    hasFrontmatter: true,
    data,
    body: lines.slice(close + 1).join('\n'),
    bodyStartLine: close + 2,
    rawLines: lines.slice(1, close),
  };
}

export function validateRequiredMetadata(parsed) {
  if (!parsed.hasFrontmatter) return ['missing YAML frontmatter at the start of the note'];
  const errors = [];
  for (const key of ['title', 'type', 'updated'])
    if (typeof parsed.data[key] !== 'string' || !parsed.data[key].trim())
      errors.push(`frontmatter is missing '${key}'`);
  if (
    typeof parsed.data.updated === 'string' &&
    parsed.data.updated &&
    !/^\d{4}-\d{2}-\d{2}$/.test(parsed.data.updated)
  )
    errors.push("frontmatter 'updated' must be an ISO date (YYYY-MM-DD)");
  if (
    parsed.data.summary !== undefined &&
    (typeof parsed.data.summary !== 'string' || !parsed.data.summary.trim())
  )
    errors.push("frontmatter 'summary' must be a non-empty string when present");
  return errors;
}
