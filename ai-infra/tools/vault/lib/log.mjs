/**
 * Retrieval event log — the feedback loop for L2/L3.
 *
 * Everything else in this toolchain validates that the vault is INTERNALLY
 * CONSISTENT. Nothing observes whether an agent actually found what it needed.
 * These are the two signals that answer that, and both were being discarded:
 *
 *   - a `find` that returns nothing  -> a missing `synonyms.tsv` row, identified
 *     empirically instead of guessed
 *   - a `show` that had to truncate  -> the observable proxy for "L3 was not
 *     enough and the agent escalated to a full Read". The CLI cannot see Read
 *     calls, so section overflow is the only measurable form of that event.
 *
 * PLACEMENT IS LOAD-BEARING. This file must NOT live under
 * `transaction-analytics/_gen/`: that directory is content-compared for
 * freshness by rules.mjs, so a file mutating on every read would make `check`
 * flap on every run. It is gitignored for the same reason — the log is local
 * observation, not repo state.
 *
 * By the same argument only `find`/`show`/`brief` ever write here. `check` and
 * `build` never do; `check`'s no-write contract is absolute.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { readTextOrNull, cmp } from './fs.mjs';

export const LOG_REL = 'tools/vault/.log.tsv';

/** Collapse anything that would break the TSV row structure. */
function cell(v) {
  return String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();
}

/**
 * Append one event. Never throws: a retrieval must not fail because logging
 * failed (read-only checkout, full disk, permissions).
 */
export function logEvent(root, { cmd, arg, outcome, detail }) {
  try {
    const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const row = [stamp, cell(cmd), cell(arg), cell(outcome), cell(detail)].join('\t');
    appendFileSync(path.resolve(root, LOG_REL), row + '\n', 'utf8');
  } catch {
    /* logging is best-effort by design */
  }
}

function readRows(root) {
  const raw = readTextOrNull(path.resolve(root, LOG_REL));
  if (!raw) return [];
  const rows = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const [ts, cmd, arg, outcome, detail] = line.split('\t');
    rows.push({ ts, cmd, arg: arg ?? '', outcome: outcome ?? '', detail: detail ?? '' });
  }
  return rows;
}

/** Group rows by `arg`, descending by count then by arg for determinism. */
function tally(rows) {
  const counts = new Map();
  const samples = new Map();
  for (const r of rows) {
    counts.set(r.arg, (counts.get(r.arg) ?? 0) + 1);
    if (!samples.has(r.arg)) samples.set(r.arg, r.detail);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))
    .map(([arg, n]) => ({ arg, n, detail: samples.get(arg) }));
}

/**
 * Report over the log. This is the tuning input for `synonyms.tsv` (misses)
 * and for section sizing (truncations).
 */
export function report(root, flags = {}) {
  const abs = path.resolve(root, LOG_REL);

  if (flags.clear) {
    writeFileSync(abs, '', { encoding: 'utf8' });
    process.stdout.write(`vault log: cleared ${LOG_REL}\n`);
    return 0;
  }

  const rows = readRows(root);
  if (!rows.length) {
    process.stdout.write(`vault log: no events yet (${LOG_REL})\n`);
    return 0;
  }

  const limit = Number(flags.n || 15);
  const misses = rows.filter((r) => r.outcome === 'miss');
  const ambiguous = rows.filter((r) => r.outcome === 'ambiguous');
  const truncated = rows.filter((r) => r.outcome === 'truncated');
  const reads = rows.filter((r) => r.cmd === 'read');
  const shows = rows.filter((r) => r.cmd === 'show' || r.cmd === 'brief');

  const out = [];
  const span = `${rows[0].ts} .. ${rows[rows.length - 1].ts}`;
  out.push(`# vault log — ${rows.length} events (${span})`);
  out.push(
    `miss=${misses.length} ambiguous=${ambiguous.length} truncated=${truncated.length} ok=${
      rows.length - misses.length - ambiguous.length - truncated.length
    }`,
  );
  // The headline number: how often an agent bypassed L3 and read a whole note.
  // A ratio near or above 1 means the retrieval protocol is not being used.
  if (reads.length || shows.length) {
    out.push(`L4 full note Reads=${reads.length} vs L3 show/brief=${shows.length}`);
  }

  const section = (title, list, hint) => {
    if (!list.length) return;
    out.push('');
    out.push(`## ${title}${hint ? `  — ${hint}` : ''}`);
    for (const { arg, n, detail } of tally(list).slice(0, limit)) {
      out.push(`${String(n).padStart(4)}  ${arg}${detail ? `\t${detail}` : ''}`);
    }
  };

  section('MISSES', misses, 'add a synonyms.tsv row or a _retrieval.tsv case');
  section('AMBIGUOUS', ambiguous, 'ref forms that needed disambiguation');
  section('TRUNCATED', truncated, 'section too long for L3 — split it or raise --max-lines');

  section('L4 READS', reads, 'notes read in full — should be edits only');

  if (!flags.misses) {
    section('QUERIES', rows.filter((r) => r.cmd === 'find'));
    section('REFS', shows);
  }

  process.stdout.write(out.join('\n') + '\n');
  return 0;
}

export { readRows };
