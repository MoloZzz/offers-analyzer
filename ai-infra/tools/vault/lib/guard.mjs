/**
 * Context governor — the live half of `vault ctx`.
 *
 * `ctx` explains where a session's tokens went, but only afterwards and only
 * when someone remembers to run it. The profiled session peaked at 282k against
 * a 50k budget and nothing observed that while it was happening. This module is
 * what observes it: a per-turn measurement cheap enough to run on every tool
 * call, plus the predicates that decide when to stop allowing the two spending
 * patterns that measurement identified.
 *
 * WHAT IT CANNOT DO: no hook can compact, clear or truncate the window. The
 * governor measures, warns once per threshold, and denies with a named escape.
 * Anything claiming more than that would be a lie about the API surface.
 *
 * FAIL-OPEN IS ABSOLUTE. Every entry point here returns "allow / say nothing"
 * on any error — unreadable transcript, corrupt state, malformed JSON. This
 * extends the contract in hook.mjs: a hook that crashes or blocks is worse than
 * no hook, and this one sits in front of every Read and Write in the session.
 *
 * PLACEMENT: state lives in `tools/vault/.ctx.json`, gitignored, NOT under
 * `transaction-analytics/_gen/`. That directory is content-compared for
 * freshness by rules.mjs, so a file mutating every turn would make `check` flap
 * on every run — the same argument already written down in log.mjs.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import * as path from 'node:path';
import { CONFIG } from './config.mjs';
import { VAULT_DIR, GEN_DIR, toPosix } from './fs.mjs';
import { readRows } from './log.mjs';

/**
 * Anything above this and the agent is working in a degraded window.
 * Read from config here rather than from ctx.mjs so that this module — which
 * loads in front of every Read and Write — never pulls in the profiler.
 * config.mjs is one memoized JSON read, so it does not change that.
 */
export const BUDGET = CONFIG.budget;

export const STATE_REL = 'tools/vault/.ctx.json';
export const HISTORY_REL = 'tools/vault/.ctx.tsv';

/** Fractions of BUDGET at which the governor escalates. Tier 2 arms the gates. */
const TIERS = [0.6, 1.0, 1.5];
/** Tier at and above which PreToolUse starts denying. */
export const GATE_TIER = 2;
/** PreToolUse fires on every Read; don't re-scan until the transcript moves. */
export const REMEASURE_BYTES = 32 * 1024;
/** A `show` this recent counts as "did L3 first, now escalating deliberately". */
const L3_GRACE_MS = 15 * 60 * 1000;
/** Sessions retained in the state file, most recently measured first. */
const KEEP_SESSIONS = 20;

const EMPTY = { offset: 0, peak: 0, announced: 0, compactions: 0, measuredAt: 0 };

/** Operator kill switch. Checked first in every handler. */
export function disabled() {
  return process.env.VAULT_CTX_OFF === '1';
}

export function tierOf(peak) {
  let t = 0;
  for (const f of TIERS) if (peak >= f * BUDGET) t++;
  return t;
}

/* ------------------------------------------------------------------ state */

export function readState(root) {
  try {
    const raw = readFileSync(path.resolve(root, STATE_REL), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {}; // absent OR corrupt — both mean "start clean", never throw
  }
}

function writeState(root, state) {
  try {
    // Unbounded growth otherwise: one entry per session, forever.
    const kept = Object.entries(state)
      .sort((a, b) => (b[1]?.measuredAt ?? 0) - (a[1]?.measuredAt ?? 0))
      .slice(0, KEEP_SESSIONS);
    writeFileSync(path.resolve(root, STATE_REL), JSON.stringify(Object.fromEntries(kept)), 'utf8');
  } catch {
    /* best-effort, same contract as logEvent */
  }
}

export function sessionState(root, sessionId) {
  return { ...EMPTY, ...(readState(root)[sessionId] ?? {}) };
}

/* ------------------------------------------------------------- measurement */

/**
 * Scan a byte range of the transcript for the largest resident context.
 *
 * Deliberately NOT profile(): this runs on every tool call. It extracts one
 * number — max(input + cache_read + cache_creation) — and a max is idempotent,
 * so the uuid dedupe profile() needs does not apply. That is what reduces
 * per-turn state to one integer and a byte offset.
 *
 * `isSidechain` MUST still be filtered: those are a subagent's own turns, so
 * their usage is the child's context, not the parent's. Counting them would
 * report a peak the parent never carried.
 */
function scan(file, from, to) {
  let fd;
  try {
    fd = openSync(file, 'r');
    const len = to - from;
    const buf = Buffer.allocUnsafe(len);
    const got = readSync(fd, buf, 0, len, from);
    const text = buf.toString('utf8', 0, got);

    // The last line may be half-written; consume only up to the final newline.
    const cut = text.lastIndexOf('\n');
    if (cut < 0) return { peak: 0, offset: from };

    let peak = 0;
    for (const line of text.slice(0, cut).split('\n')) {
      // Cheap reject before JSON.parse — most lines carry no usage record.
      if (!line || !line.includes('"usage"')) continue;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.isSidechain) continue;
      const u = ev.message?.usage;
      if (!u) continue;
      const ctx = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      if (ctx > peak) peak = ctx;
    }
    return { peak, offset: from + Buffer.byteLength(text.slice(0, cut + 1), 'utf8') };
  } catch {
    return { peak: 0, offset: from };
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Refresh the stored peak for one session from newly appended transcript bytes.
 * `minGrowth` lets the hot path skip work when nothing meaningful was written.
 */
export function measure(root, transcriptPath, sessionId, { minGrowth = 0 } = {}) {
  const prev = sessionState(root, sessionId);
  if (!transcriptPath || !sessionId) return { ...prev, tier: tierOf(prev.peak), changed: false };

  let size;
  try {
    const st = statSync(transcriptPath);
    if (!st.isFile()) return { ...prev, tier: tierOf(prev.peak), changed: false };
    size = st.size;
  } catch {
    return { ...prev, tier: tierOf(prev.peak), changed: false };
  }

  // Rotation or rewrite: the file is shorter than where we stopped reading.
  const from = size < prev.offset ? 0 : prev.offset;
  // The throttle applies only once there IS a prior measurement to fall back on.
  // Honouring it on the first call would leave the gate disarmed for the whole
  // of a short transcript, deciding from a peak of 0 it never actually read.
  const throttle = prev.measuredAt ? minGrowth : 0;
  if (size === from || size - from < throttle) {
    return { ...prev, tier: tierOf(prev.peak), changed: false };
  }

  const s = scan(transcriptPath, from, size);
  const peak = Math.max(prev.peak, s.peak);
  const next = { ...prev, offset: s.offset, peak, measuredAt: Date.now() };
  const state = readState(root);
  state[sessionId] = next;
  writeState(root, state);
  return { ...next, tier: tierOf(peak), changed: true };
}

/** Record that a tier was announced, so the warning never repeats. */
export function markAnnounced(root, sessionId, tier) {
  const state = readState(root);
  state[sessionId] = { ...EMPTY, ...(state[sessionId] ?? {}), announced: tier, measuredAt: Date.now() };
  writeState(root, state);
}

/**
 * PreCompact: a compaction is the loudest evidence the budget failed — and the
 * one event after which the recorded peak stops describing the live window,
 * because the window genuinely got smaller.
 *
 * So this resets the measurement to the post-compaction baseline instead of
 * carrying a monotonic maximum forward. Without it, one 280k session would keep
 * the gates armed for the rest of its life no matter how much room compaction
 * just freed. The count survives as the durable record that it happened.
 */
export function noteCompaction(root, sessionId, transcriptPath) {
  if (!sessionId) return;
  let offset = 0;
  try {
    offset = statSync(transcriptPath).size;
  } catch {
    /* unknown size — re-read from the start, which is merely slower */
  }
  const state = readState(root);
  const cur = { ...EMPTY, ...(state[sessionId] ?? {}) };
  state[sessionId] = {
    ...cur,
    peak: 0,
    announced: 0,
    offset,
    compactions: (cur.compactions ?? 0) + 1,
    measuredAt: Date.now(),
  };
  writeState(root, state);
}

/** SessionEnd: stdout is not added to context there, so this row is free. */
export function appendHistory(root, sessionId, extra = {}) {
  try {
    const s = sessionState(root, sessionId);
    const row = [
      new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      sessionId ?? '',
      s.peak,
      tierOf(s.peak),
      extra.reason ?? '',
      s.compactions ?? 0,
    ].join('\t');
    appendFileSync(path.resolve(root, HISTORY_REL), row + '\n', 'utf8');
  } catch {
    /* best-effort */
  }
}

/**
 * `ctx --history` — the trend across sessions, from the rows SessionEnd wrote.
 * `ctx --all` answers the same question by re-profiling every transcript on
 * disk, which gets slower with every session; this is a single file read.
 */
export function historyReport(root, flags = {}) {
  let rows;
  try {
    rows = readFileSync(path.resolve(root, HISTORY_REL), 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        const [ts, id, peak, tier, reason, compactions] = l.split('\t');
        return { ts, id, peak: Number(peak) || 0, tier: Number(tier) || 0, reason, compactions: Number(compactions) || 0 };
      });
  } catch {
    process.stdout.write(
      `vault ctx: no session history yet (${HISTORY_REL})\n` +
        'Rows are written by the SessionEnd hook; the first appears when this session ends.\n',
    );
    return 0;
  }
  if (!rows.length) {
    process.stdout.write(`vault ctx: no session history yet (${HISTORY_REL})\n`);
    return 0;
  }

  const limit = Number(flags.n || 20);
  const shown = rows.slice(-limit);
  const over = rows.filter((r) => r.peak > BUDGET).length;
  const L = [`# vault ctx --history — ${rows.length} session(s), budget ${BUDGET.toLocaleString()}`];
  for (const r of shown) {
    L.push(
      `${String(r.peak).padStart(9)} tok  tier ${r.tier}  ${(r.ts ?? '').slice(0, 16)}  ${(r.id ?? '').slice(0, 8)}` +
        `${r.compactions ? `  ${r.compactions} compaction(s)` : ''}${r.peak > BUDGET ? '  OVER' : ''}`,
    );
  }
  L.push('');
  L.push(`${over}/${rows.length} session(s) over budget`);
  process.stdout.write(L.join('\n') + '\n');
  return flags.strict && over ? 1 : 0;
}

/* ------------------------------------------------------------------ gates */

/** True for a hand-written vault note (never the generated tree). */
export function isVaultNote(rel) {
  return rel.startsWith(`${VAULT_DIR}/`) && rel.endsWith('.md') && !rel.startsWith(`${GEN_DIR}/`);
}

/** Repo-relative POSIX path, or null when the target sits outside the repo. */
function insideRepo(root, filePath) {
  if (!filePath) return null;
  const rel = path.relative(root, path.resolve(filePath));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return toPosix(rel);
}

/**
 * Write on a file that already exists re-injects the whole superseded body.
 * Measured on a real session: Write averaged 1,610 tok/call against Edit's 293.
 *
 * Creating a new file is not the waste, and anything outside the repo is exempt
 * — the scratchpad and ~/.claude/plans are both written with Write by design.
 */
export function writeVerdict(root, filePath) {
  const rel = insideRepo(root, filePath);
  if (!rel) return null;
  if (!existsSync(path.resolve(root, rel))) return null;
  return (
    `Context is over budget, so full-file Write is gated. '${rel}' already exists — ` +
    `use Edit (measured ~293 tok/call against Write's ~1,610; a rewrite leaves the entire ` +
    `superseded body in context for the rest of the session). ` +
    `Set VAULT_CTX_OFF=1 if this really must be a full rewrite.`
  );
}

/**
 * A full note Read is L4, which is for EDITING a note. Consulting one costs a
 * fraction of that via `show`. The existing post-read hook only nudges after
 * the tokens are already spent; this is the same signal moved to where it can
 * still prevent the cost.
 *
 * The escape is deliberately the command the protocol wants anyway: run `show`
 * on the note and the Read is allowed, because that is the legitimate L3->L4
 * escalation. Fails open on any log problem — never trap an agent that is
 * trying to edit a note.
 */
export function readVerdict(root, filePath) {
  const rel = insideRepo(root, filePath);
  if (!rel || !isVaultNote(rel)) return null;

  const note = path.basename(rel, '.md');
  try {
    const cutoff = Date.now() - L3_GRACE_MS;
    const consulted = readRows(root).some((r) => {
      if (r.cmd !== 'show' && r.cmd !== 'brief') return false;
      const t = Date.parse(r.ts);
      if (!Number.isFinite(t) || t < cutoff) return false;
      return `${r.arg} ${r.detail}`.toLowerCase().includes(note.toLowerCase());
    });
    if (consulted) return null; // did L3 first — this is a deliberate edit
  } catch {
    return null; // fail open
  }

  return (
    `Context is over budget, so full note Reads are gated. Read one section instead: ` +
    `node tools/vault/v.mjs show "${note}#<anchor>"  (find the anchor with: v.mjs find "<query>"). ` +
    `If you are about to EDIT this note, run that show first and the Read is allowed.`
  );
}
