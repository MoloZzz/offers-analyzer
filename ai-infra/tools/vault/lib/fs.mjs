/**
 * Filesystem + normalization primitives for the vault tooling.
 *
 * Every downstream acceptance number (link counts, digests, sort order) flows
 * through this module, so the normalization rules here are load-bearing:
 *
 *   - all paths are POSIX-separated, NFC-normalized, repo-root-relative
 *   - all text is read as UTF-8, CRLF stripped, NFC-normalized
 *   - all output is LF / UTF-8 / no BOM / exactly one trailing newline
 *   - all sorting uses raw code units (NEVER localeCompare, which is locale
 *     dependent and would make `build` non-deterministic across machines)
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { CONFIG } from './config.mjs';

export const VAULT_DIR = CONFIG.vaultDir;
export const GEN_DIR = `${VAULT_DIR}/_gen`;
/** The project's code root. Named for history; `config.codeRoot` is the truth. */
export const BACKEND_DIR = CONFIG.codeRoot;

/** Convert any platform path to the POSIX form used as a vault-internal identifier. */
export function toPosix(p) {
  return p.split(path.sep).join('/').normalize('NFC');
}

/**
 * Normalize text for comparison and hashing: strip CR, normalize Unicode.
 * Applied to BOTH sides of every comparison so CRLF worktrees and NFD
 * filesystems cannot produce spurious diffs.
 */
export function norm(text) {
  return text.replace(/\r\n?/g, '\n').normalize('NFC');
}

/** Raw code-unit comparator. Deterministic across locales and platforms. */
export function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Sort a copy of `arr` by `key` using the raw code-unit comparator. */
export function sortBy(arr, key = (x) => x) {
  return [...arr].sort((a, b) => cmp(key(a), key(b)));
}

export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Short digest used for the `rev:` frontmatter pin. */
export function shortDigest(text) {
  return sha256(text).slice(0, 12);
}

export function exists(p) {
  return existsSync(p);
}

/** Read a text file, normalized. Throws with the path on failure. */
export function readText(p) {
  try {
    return norm(readFileSync(p, 'utf8'));
  } catch (err) {
    throw new Error(`cannot read ${toPosix(p)}: ${err.message}`);
  }
}

export function readTextOrNull(p) {
  return existsSync(p) ? readText(p) : null;
}

/**
 * Write text as LF / UTF-8 / no BOM with exactly one trailing newline.
 * Returns true when the on-disk bytes actually changed, so callers can report
 * a real diff instead of touching mtimes on every run.
 */
export function writeText(p, text) {
  const out = norm(text).replace(/\n*$/, '\n');
  if (existsSync(p) && readFileSync(p, 'utf8') === out) return false;
  writeFileSync(p, out, { encoding: 'utf8' });
  return true;
}

/**
 * Recursively collect files under `dir` (no glob dependency).
 * Returns POSIX paths relative to `root`, sorted by code unit.
 * Skips dot-directories and node_modules/dist by default.
 */
export function walk(root, dir, { ext = null, skip = /^(node_modules|dist|\.)/ } = {}) {
  const out = [];
  const abs = path.resolve(root, dir);
  if (!existsSync(abs)) return out;

  const visit = (cur) => {
    for (const entry of readdirSync(cur, { withFileTypes: true })) {
      if (skip.test(entry.name)) continue;
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) {
        if (ext && !entry.name.endsWith(ext)) continue;
        out.push(toPosix(path.relative(root, full)));
      }
    }
  };

  if (statSync(abs).isDirectory()) visit(abs);
  return out.sort(cmp);
}

/**
 * Digest a set of repo-relative files into a stable 12-hex `rev`.
 * Content is normalized and trailing whitespace stripped per line, so
 * formatting-only churn does not invalidate a pin.
 */
export function digestFiles(root, relPaths) {
  const parts = sortBy(relPaths).map((rel) => {
    const abs = path.resolve(root, rel);
    const body = existsSync(abs)
      ? norm(readFileSync(abs, 'utf8'))
          .split('\n')
          .map((l) => l.replace(/[ \t]+$/, ''))
          .join('\n')
      : '';
    return `${rel}:${sha256(body)}`;
  });
  return shortDigest(parts.join('\n'));
}

/**
 * Memoized whole-repo listing for `expandPatterns`.
 *
 * Every note carrying a `code:` glob triggers one of these during `rev-stale`.
 * With 9 pinned notes that is 9 full-repo walks per `check` — in the pre-commit
 * path. The walk is a pure function of the tree and the tool is a short-lived
 * process, so caching it per root is safe.
 */
const repoListingCache = new Map();

function repoListing(root) {
  let all = repoListingCache.get(root);
  if (!all) {
    all = walk(root, '.', { skip: /^(node_modules|dist|\.git|\.githooks)/ });
    repoListingCache.set(root, all);
  }
  return all;
}

/**
 * Expand simple `dir/**` and `dir/*.ext` patterns against the walked file list.
 * Deliberately minimal: the `code:` frontmatter field only ever uses these two
 * shapes, and a full glob implementation would be a dependency or a bug farm.
 */
/**
 * `'backend/'`, or `''` when the code root IS the repo root. Every path built
 * from the code root goes through this rather than `${BACKEND_DIR}/`, which
 * would produce `./src/...` for the default config and match nothing —
 * `walk()` returns `src/...`.
 */
export const CODE_PREFIX = !BACKEND_DIR || BACKEND_DIR === '.' ? '' : `${BACKEND_DIR}/`;

/**
 * A note's `code:` entry may be written relative to the code root (`src/x.ts`)
 * or from the repo root (`backend/src/x.ts`). Both must resolve to the same
 * files, so every caller of `expandPatterns` on `code:` frontmatter goes
 * through here — this used to be the same expression copied into three places,
 * where changing the code root would have fixed two of them.
 */
export function resolveCodePattern(p) {
  return !CODE_PREFIX || p.startsWith(CODE_PREFIX) ? p : `${CODE_PREFIX}${p}`;
}

export function expandPatterns(root, patterns) {
  const all = repoListing(root);
  const hits = new Set();
  for (const pattern of patterns) {
    const rx = new RegExp(
      '^' +
        pattern
          .normalize('NFC')
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*\*/g, '\0')
          .replace(/\*/g, '[^/]*')
          .replace(/\0/g, '.*') +
        '$',
    );
    for (const f of all) if (rx.test(f)) hits.add(f);
  }
  return sortBy([...hits]);
}
