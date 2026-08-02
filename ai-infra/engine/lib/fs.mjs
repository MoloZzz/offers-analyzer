/** Deterministic, read-mostly filesystem primitives used by the vault engine. */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

export function toPosix(value) {
  return String(value).split(path.sep).join('/').normalize('NFC');
}

export function norm(text) {
  return String(text)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .normalize('NFC');
}

export function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortBy(items, key = (item) => item) {
  return [...items].sort((left, right) => cmp(key(left), key(right)));
}

export function exists(file) {
  return existsSync(file);
}

export function readText(file) {
  try {
    return norm(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${toPosix(file)}: ${error.message}`);
  }
}

export function readTextOrNull(file) {
  return existsSync(file) ? readText(file) : null;
}

/** Only render.mjs imports this writer; check and retrieval stay read-only. */
export function writeGeneratedText(file, text) {
  const output = norm(text).replace(/\n*$/, '\n');
  if (existsSync(file) && readFileSync(file, 'utf8') === output) return false;
  writeFileSync(file, output, 'utf8');
  return true;
}

export function walk(root, directory, { ext = null, skipDir = () => false } = {}) {
  const output = [];
  const base = path.resolve(root, directory);
  if (!existsSync(base) || !statSync(base).isDirectory()) return output;
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const rel = toPosix(path.relative(root, full));
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === '.git' ||
          skipDir(entry.name, rel)
        )
          continue;
        visit(full);
      } else if (entry.isFile() && (!ext || entry.name.endsWith(ext))) {
        output.push(rel);
      }
    }
  };
  visit(base);
  return output.sort(cmp);
}

export function shortDigest(text) {
  return createHash('sha256').update(norm(text), 'utf8').digest('hex').slice(0, 12);
}

export function digestFiles(root, relPaths) {
  const rows = sortBy(relPaths).map((rel) => {
    const file = path.resolve(root, rel);
    const body = existsSync(file)
      ? readText(file)
          .split('\n')
          .map((line) => line.replace(/[ \t]+$/, ''))
          .join('\n')
      : '';
    return `${toPosix(rel)}:${shortDigest(body)}`;
  });
  return shortDigest(rows.join('\n'));
}

export function codePrefix(config) {
  return config.codeRoot === '.' ? '' : `${config.codeRoot}/`;
}

export function resolveCodePattern(config, pattern) {
  const normalized = String(pattern).replace(/\\/g, '/').replace(/^\.\//, '');
  const prefix = codePrefix(config);
  return !prefix || normalized.startsWith(prefix) ? normalized : `${prefix}${normalized}`;
}

/** Minimal dependency-free glob support for optional narrow revision pins. */
export function expandPatterns(root, patterns) {
  const all = walk(root, '.');
  const hits = new Set();
  for (const rawPattern of patterns) {
    const pattern = String(rawPattern).replace(/\\/g, '/').normalize('NFC');
    const expression =
      '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\u0000')
        .replace(/\*/g, '[^/]*')
        .replace(/\u0000/g, '.*') +
      '$';
    const matcher = new RegExp(expression);
    for (const file of all) if (matcher.test(file)) hits.add(file);
  }
  return sortBy([...hits]);
}
