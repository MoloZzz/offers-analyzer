/**
 * Git plumbing wrapper for the vault tooling.
 *
 * HARD RULES enforced throughout this module:
 *   - never execSync / shell:true — a shell string routes through cmd.exe and
 *     the OEM codepage mangles Cyrillic; only execFileSync('git', [argv]).
 *   - every call always requests encoding:'buffer' from execFileSync and
 *     decodes stdout as UTF-8 itself, so we control exactly where/how bytes
 *     become a JS string (never delegate that to Node's default encoding).
 *   - every invocation that lists paths passes -z (NUL-separated) plus
 *     `-c core.quotepath=false`, so C-quoted octal-escaped filenames
 *     (e.g. "...Card\342\206\224Crypto...") never appear on the wire — we get
 *     raw UTF-8 bytes instead and NFC-normalize them ourselves via fs.mjs.
 *   - `cat-file --batch` output is byte-sliced on the raw Buffer, never on a
 *     decoded string: Cyrillic content is multi-byte UTF-8, and slicing by
 *     character index would desynchronize the batch protocol immediately.
 *   - every function runs git with `-C <repo root>` so behavior is identical
 *     regardless of the process's current working directory. The caller
 *     (v.mjs) chdirs to root first, but this module must not assume that.
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { toPosix, norm } from './fs.mjs';

const NL = 0x0a; // '\n' byte — used to find cat-file --batch header boundaries

/**
 * Low-level execFileSync('git', args) wrapper. Never touches a shell.
 * Always decodes stdout as UTF-8 itself; returns a trimmed string unless
 * `opts.raw` is set (raw is required for -z output, where trim() could eat a
 * meaningful trailing NUL-delimited empty field).
 */
export function git(args, opts = {}) {
  const { raw = false, ...execOpts } = opts;
  const out = execFileSync('git', args, {
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 64,
    ...execOpts,
  });
  const text = out.toString('utf8');
  return raw ? text : text.trim();
}

let _root = null;

/** Absolute repo root, resolved once via `git rev-parse --show-toplevel` and cached. */
export function toplevel() {
  if (_root === null) {
    _root = path.resolve(git(['rev-parse', '--show-toplevel']));
  }
  return _root;
}

/** Run git anchored at the repo root regardless of the current process cwd. */
function gitAtRoot(args, opts = {}) {
  return git(['-C', toplevel(), ...args], opts);
}

/** Split a -z (NUL-terminated) git output into posix/NFC-normalized paths. */
function splitZ(text) {
  return text
    .split('\0')
    .filter((p) => p.length > 0)
    .map((p) => toPosix(p));
}

/** Staged (index vs HEAD) paths with an Add/Copy/Modify/Rename status. */
export function stagedPaths() {
  const out = gitAtRoot(
    ['-c', 'core.quotepath=false', 'diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'],
    { raw: true },
  );
  return splitZ(out);
}

/** Unstaged-modified (worktree vs index) paths under `prefix`. */
export function worktreeDirty(prefix) {
  const out = gitAtRoot(['-c', 'core.quotepath=false', 'diff', '--name-only', '-z', '--', prefix], {
    raw: true,
  });
  return splitZ(out);
}

/** Whether `relPath` (repo-root-relative, posix) is tracked by git. */
export function isTracked(relPath) {
  const out = gitAtRoot(['-c', 'core.quotepath=false', 'ls-files', '-z', '--', relPath], { raw: true });
  return splitZ(out).length > 0;
}

/**
 * Resolve every ref in `refs` (e.g. ":transaction-analytics/foo.md",
 * "HEAD:some/path.md") to its blob content in exactly ONE
 * `git cat-file --batch` process — spawning a process per ref is exactly
 * what this function exists to avoid.
 *
 * All refs are fed on stdin (one per line) via execFileSync's `input`
 * option, and the batch protocol is parsed by hand:
 *   success:  "<sha> <type> <size>\n" + <size> RAW BYTES + "\n"
 *   missing:  "<ref> missing\n"
 * The success line never echoes the requested ref back, so results are
 * matched to `refs` purely by emission order — which git guarantees matches
 * input order for --batch.
 *
 * Returns Map<ref, string|null> (null when git could not resolve that ref).
 */
export function catFileBatch(refs) {
  const result = new Map();
  if (refs.length === 0) return result;

  const input = Buffer.from(refs.join('\n') + '\n', 'utf8');
  const out = execFileSync('git', ['-C', toplevel(), '-c', 'core.quotepath=false', 'cat-file', '--batch'], {
    input,
    encoding: 'buffer',
    maxBuffer: 1024 * 1024 * 256,
  });

  let offset = 0;
  for (const ref of refs) {
    const headerEnd = out.indexOf(NL, offset);
    if (headerEnd === -1) {
      throw new Error(`git.mjs: catFileBatch: truncated batch stream while resolving '${ref}'`);
    }
    const header = out.slice(offset, headerEnd).toString('utf8');
    const parts = header.split(' ');

    if (parts[parts.length - 1] === 'missing') {
      result.set(ref, null);
      offset = headerEnd + 1;
      continue;
    }

    const size = parseInt(parts[2], 10);
    if (parts.length !== 3 || !Number.isFinite(size)) {
      throw new Error(`git.mjs: catFileBatch: unrecognized batch header '${header}' for '${ref}'`);
    }

    // BYTE offsets on the raw Buffer — never char offsets on a decoded
    // string — because `size` counts UTF-8 bytes, not JS string length.
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + size;
    const content = out.slice(contentStart, contentEnd).toString('utf8');
    result.set(ref, norm(content));
    offset = contentEnd + 1; // skip the single trailing '\n' after the content block
  }

  return result;
}
