/** Vault note discovery and structural parsing. */
import * as path from 'node:path';
import { readText, toPosix, walk } from './fs.mjs';
import { parseFrontmatter } from './frontmatter.mjs';

const FENCE_OPEN_RE = /^[ \t]{0,3}(`{3,}|~{3,})/;
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const WIKILINK_RE = /!?\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]*))?\]\]/g;

function slash(value) {
  return String(value).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

export function vaultRelative(relPath, config) {
  const normalized = slash(relPath);
  const prefix = `${config.vaultDir}/`;
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
}

export function isGeneratedPath(relPath, config) {
  const rel = vaultRelative(relPath, config);
  return rel === '_gen' || rel.startsWith('_gen/');
}

export function isContextPath(relPath, config) {
  const rel = vaultRelative(relPath, config);
  const context = slash(config.contextDir);
  return rel === context || rel.startsWith(`${context}/`);
}

/** Remove fenced blocks while preserving line numbers. */
export function stripFences(text) {
  const lines = String(text).split('\n');
  const output = [];
  let marker = null;

  for (const line of lines) {
    const open = line.match(FENCE_OPEN_RE);
    if (!marker) {
      if (open) {
        marker = { char: open[1][0], length: open[1].length };
        output.push('');
      } else {
        output.push(line);
      }
      continue;
    }

    output.push('');
    const close = new RegExp(`^[ \\t]{0,3}${marker.char}{${marker.length},}\\s*$`);
    if (close.test(line)) marker = null;
  }
  return output.join('\n');
}

function stripInlineCode(text) {
  return String(text)
    .split('\n')
    .map((line) => line.replace(/`[^`\n]*`/g, (match) => ' '.repeat(match.length)))
    .join('\n');
}

export function extractHeadings(source) {
  const lines = stripFences(source).split('\n');
  const headings = [];
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(HEADING_RE);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: index + 1,
        endLine: lines.length,
      });
    }
  }
  for (let index = 0; index < headings.length; index++) {
    const current = headings[index];
    const nextAtSameOrHigher = headings
      .slice(index + 1)
      .find((candidate) => candidate.level <= current.level);
    current.endLine = nextAtSameOrHigher ? nextAtSameOrHigher.line - 1 : lines.length;
  }
  return headings;
}

export function extractLinks(source) {
  const scrubbed = stripInlineCode(stripFences(source));
  const links = [];
  for (const match of scrubbed.matchAll(WIKILINK_RE)) {
    const line = scrubbed.slice(0, match.index).split('\n').length;
    links.push({
      target: match[1].trim(),
      anchor: match[2] ? match[2].trim() : null,
      alias: match[3] ? match[3].trim() : null,
      embed: match[0].startsWith('!'),
      line,
    });
  }
  return links;
}

export function parseNote(root, relPath, config) {
  const posixPath = toPosix(relPath);
  const raw = readText(path.resolve(root, posixPath));
  const frontmatter = parseFrontmatter(raw);
  const rel = vaultRelative(posixPath, config);
  const dirRaw = path.posix.dirname(rel);
  const dir = dirRaw === '.' ? '' : dirRaw;

  return {
    path: posixPath,
    rel,
    name: path.posix.basename(rel, '.md'),
    dir,
    title: frontmatter.data.title || path.posix.basename(rel, '.md'),
    type: frontmatter.data.type || '',
    data: frontmatter.data,
    body: frontmatter.body,
    bodyStartLine: frontmatter.bodyStartLine,
    hasFrontmatter: frontmatter.hasFrontmatter,
    lines: raw.split('\n'),
    headings: extractHeadings(raw),
    links: extractLinks(raw),
    isContext: isContextPath(posixPath, config),
  };
}

export function notePaths(root, config, { includeContext = false } = {}) {
  const files = walk(root, config.vaultDir, { ext: '.md' });
  return files.filter((relPath) => {
    if (isGeneratedPath(relPath, config)) return false;
    return includeContext || !isContextPath(relPath, config);
  });
}

export function loadNotes(root, config, options = {}) {
  return notePaths(root, config, options).map((relPath) => parseNote(root, relPath, config));
}

/** Parse every requested note, retaining malformed-file diagnostics for `check`. */
export function loadNotesWithErrors(root, config, options = {}) {
  const notes = [];
  const errors = [];
  for (const relPath of notePaths(root, config, options)) {
    try {
      notes.push(parseNote(root, relPath, config));
    } catch (error) {
      errors.push({ path: vaultRelative(relPath, config), message: error.message });
    }
  }
  return { notes, errors };
}

export function sectionOf(note, headingIndex) {
  const heading = note.headings[headingIndex];
  if (!heading) throw new Error(`heading ${headingIndex + 1} does not exist in ${note.rel}`);
  return {
    heading,
    startLine: heading.line,
    endLine: heading.endLine,
    text: note.lines.slice(heading.line - 1, heading.endLine).join('\n'),
  };
}
