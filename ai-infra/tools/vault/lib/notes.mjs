/**
 * Vault note loading + parsing.
 *
 * A "note" is one `.md` file under `transaction-analytics/` (excluding the
 * generated `_gen/` tree). This module extracts headings and wikilinks from
 * note text, always working on a fence-stripped (and, for links, inline-code
 * stripped) copy so code samples never leak into the structural model —
 * while keeping every reported `line` a valid 1-based index into the
 * original file.
 */
import * as path from 'node:path';
import { VAULT_DIR, toPosix, walk, readText } from './fs.mjs';
import { parse as parseFrontmatter } from './frontmatter.mjs';

/** Vault-relative top folder -> Note.type. '' (root notes) -> 'index'. */
const TYPE_BY_DIR = {
  Architecture: 'architecture',
  Business: 'business',
  Sources: 'source',
  Decisions: 'decision',
  Plans: 'plan',
  '': 'index',
};

const FENCE_OPEN_RE = /^(`{3,}|~{3,})/;
const ATX_RE = /^(#{1,6})\s+(.*?)\s*$/;
const LINK_RE = /!?\[\[([^\]|#]+)(#[^\]|]+)?(\|[^\]]*)?\]\]/g;

/**
 * Blank out fenced code blocks (``` and ~~~, CommonMark-style, up to 3 leading
 * spaces of indentation), replacing every line inside the fence (including
 * the delimiter lines themselves) with an empty string. The number of lines
 * in the output always equals the number of lines in the input, so any line
 * number computed against the original text stays valid against this output.
 */
export function stripFences(text) {
  const lines = text.split('\n');
  const out = new Array(lines.length);
  let inFence = false;
  let fenceChar = null;
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.replace(/^[ \t]{0,3}/, '');

    if (!inFence) {
      const m = trimmed.match(FENCE_OPEN_RE);
      if (m) {
        inFence = true;
        fenceChar = m[1][0];
        fenceLen = m[1].length;
        out[i] = '';
        continue;
      }
      out[i] = line;
      continue;
    }

    out[i] = '';
    const closeRe = new RegExp(`^(\\${fenceChar}{${fenceLen},})\\s*$`);
    if (closeRe.test(trimmed)) {
      inFence = false;
      fenceChar = null;
      fenceLen = 0;
    }
  }

  return out.join('\n');
}

/** Blank `inline code` spans (per line — spans never cross lines here). */
function stripInlineCode(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length)))
    .join('\n');
}

/** ATX headings (outside fences) with computed section boundaries. */
function extractHeadings(rawText) {
  const lines = stripFences(rawText).split('\n');
  const headings = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ATX_RE);
    if (m) {
      headings.push({ level: m[1].length, text: m[2].trim(), line: i + 1, endLine: lines.length });
    }
  }

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    let end = lines.length;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= h.level) {
        end = headings[j].line - 1;
        break;
      }
    }
    h.endLine = end;
  }

  return headings;
}

/** Wikilinks (outside fences, outside inline code) with 1-based line numbers. */
function extractLinks(rawText) {
  const scrubbed = stripInlineCode(stripFences(rawText));
  const re = new RegExp(LINK_RE.source, 'g');
  const links = [];
  let m;
  while ((m = re.exec(scrubbed))) {
    const line = scrubbed.slice(0, m.index).split('\n').length;
    links.push({
      target: m[1].trim(),
      anchor: m[2] ? m[2].slice(1).trim() : null,
      alias: m[3] ? m[3].slice(1).trim() : null,
      embed: m[0].startsWith('!'),
      line,
    });
  }
  return links;
}

/**
 * Parse one vault note.
 * `relPath` is a POSIX repo-relative path, e.g.
 * 'transaction-analytics/Architecture/Data Model.md' (what `walk()` returns).
 */
export function parseNote(root, relPath) {
  const posixPath = toPosix(relPath);
  const raw = readText(path.resolve(root, posixPath));

  const { data, body, bodyStartLine } = parseFrontmatter(raw);

  const rel = posixPath.startsWith(`${VAULT_DIR}/`)
    ? posixPath.slice(VAULT_DIR.length + 1)
    : posixPath;

  const dirRaw = path.posix.dirname(rel);
  const dir = dirRaw === '.' ? '' : dirRaw;
  const name = path.posix.basename(rel, '.md');
  const type = Object.prototype.hasOwnProperty.call(TYPE_BY_DIR, dir) ? TYPE_BY_DIR[dir] : dir.toLowerCase();

  return {
    path: posixPath,
    rel,
    name,
    dir,
    type,
    data,
    body,
    bodyStartLine,
    lines: raw.split('\n'),
    headings: extractHeadings(raw),
    links: extractLinks(raw),
  };
}

/** Every vault note (all `.md` under VAULT_DIR except `_gen/`), path-sorted. */
export function loadNotes(root) {
  const files = walk(root, VAULT_DIR, { ext: '.md', skip: /^(node_modules|dist|\.|_gen)/ });
  return files.map((relPath) => parseNote(root, relPath));
}

/** The heading at `headingIndex` through its section boundary, verbatim. */
export function sectionOf(note, headingIndex) {
  const heading = note.headings[headingIndex];
  if (!heading) {
    throw new Error(
      `sectionOf: heading index ${headingIndex} out of range for ${note.path} (${note.headings.length} headings)`,
    );
  }
  const text = note.lines.slice(heading.line - 1, heading.endLine).join('\n');
  return { heading, startLine: heading.line, endLine: heading.endLine, text };
}
