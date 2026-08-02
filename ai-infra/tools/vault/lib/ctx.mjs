/**
 * Context spend profiler — `vault ctx`.
 *
 * The rest of this toolchain optimises what an agent must READ to understand
 * the project. Profiling an actual session showed that surface to be under 1%
 * of the context: ~2.4k tokens of CLAUDE.md + L1 against a 282k peak. The other
 * 99% is the work itself — tool parameters, tool results, and subagent reports.
 * None of it was measured, so none of it was managed.
 *
 * This reads Claude Code's own session transcripts and reports where the tokens
 * went. It is a linter for context spend: the FINDINGS section names the
 * specific calls to fix, because an aggregate number changes no behaviour.
 *
 * READ-ONLY, and reads OUTSIDE the repo (~/.claude/projects). Never hook-callable
 * — not because it writes (it does not), but because it is an analysis command
 * whose cost scales with transcript size.
 *
 * Token figures are an ESTIMATE from a chars-per-token heuristic, not a real
 * tokenizer. Ratios between rows are trustworthy; absolute values are ±15%.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// BUDGET lives in guard.mjs — it is the governor's threshold, and this module
// only reports against it. The dependency runs reporter -> governor and never
// back, which is what keeps this profiler out of the per-tool-call hot path.
import { BUDGET } from './guard.mjs';
/** A single tool result over this is worth naming individually. */
const FAT_RESULT = 4_000;
/** A subagent whose report costs this much has defeated its own purpose. */
const FAT_AGENT_REPORT = 2_000;
/** Re-injected reminders past this point are worth pruning at the source. */
const FAT_REMINDER = 5_000;

/**
 * Attachment kinds that are fixed environment overhead (tool/agent/MCP/skill
 * listings). Separated in the report because they are not a behaviour anyone
 * can change from inside a session — unlike `task_reminder`, which scales with
 * how long the task list is allowed to get.
 */
const ENV_ATTACH = new Set([
  'deferred_tools_delta',
  'agent_listing_delta',
  'mcp_instructions_delta',
  'skill_listing',
]);

/**
 * Cyrillic runs ~2 chars/token against ~4 for latin, so a flat divisor
 * understates any Ukrainian content by roughly half. Cheap two-bucket
 * correction — still a heuristic, but not a systematically biased one.
 */
export function estTokens(text) {
  if (!text) return 0;
  let cyr = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if ((c >= 0x0400 && c <= 0x04ff) || (c >= 0x0500 && c <= 0x052f)) cyr++;
  }
  return Math.round(cyr / 2 + (text.length - cyr) / 4);
}

/**
 * Claude Code stores transcripts under a directory named after the project
 * path with every non-alphanumeric character replaced by `-`.
 */
export function projectDir(root) {
  const base = process.env.CLAUDE_CONFIG_DIR
    ? path.resolve(process.env.CLAUDE_CONFIG_DIR, 'projects')
    : path.resolve(os.homedir(), '.claude', 'projects');
  return path.join(base, path.resolve(root).replace(/[^A-Za-z0-9]/g, '-'));
}

export function sessions(root) {
  const dir = projectDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const abs = path.join(dir, f);
      const st = statSync(abs);
      return { id: f.replace(/\.jsonl$/, ''), abs, mtime: st.mtimeMs, bytes: st.size };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

/**
 * Parse one transcript.
 *
 * Two filters are load-bearing and both were found by getting them wrong first:
 *   - dedupe by `uuid`: transcripts replay events, and counting them twice
 *     inflated every figure by ~50%.
 *   - drop `isSidechain`: those are a SUBAGENT's internal turns. They are
 *     exactly the tokens that never entered the parent's context, so counting
 *     them would credit the delegation with a cost it successfully avoided.
 */
export function profile(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const cat = new Map();          // category -> {tok, n}
  const tools = new Map();        // toolName -> {result, params, n, max}
  const writes = new Map();       // path -> [tok]
  const fat = [];                 // individual oversized results
  const attach = new Map();       // attachment kind -> {tok, n, max}
  const callName = new Map();     // tool_use id -> name
  const seen = new Set();
  const turnIds = new Set();      // distinct message.id == real API turns
  let peak = 0, first = null, last = null, sidechain = 0, dup = 0;

  const bump = (k, tok) => {
    const b = cat.get(k) ?? { tok: 0, n: 0 };
    b.tok += tok; b.n++; cat.set(k, b);
  };
  const tool = (name) => {
    let b = tools.get(name);
    if (!b) tools.set(name, (b = { result: 0, params: 0, n: 0, max: 0 }));
    return b;
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }

    if (ev.uuid) { if (seen.has(ev.uuid)) { dup++; continue; } seen.add(ev.uuid); }
    if (ev.isSidechain) { sidechain++; continue; }
    if (ev.timestamp) { first ??= ev.timestamp; last = ev.timestamp; }

    // Injected by the harness, not by either party: reminders, hook output,
    // tool/agent/skill listings. Invisible in the conversation and, measured,
    // a top-three consumer — which is exactly why it needs its own line.
    if (ev.type === 'attachment') {
      const kind = ev.attachment?.type ?? 'unknown';
      const tok = estTokens(JSON.stringify(ev.attachment ?? {}));
      const b = attach.get(kind) ?? { tok: 0, n: 0, max: 0 };
      b.tok += tok; b.n++; b.max = Math.max(b.max, tok);
      attach.set(kind, b);
      bump(ENV_ATTACH.has(kind) ? 'environment listings' : 'harness injections', tok);
      continue;
    }

    const u = ev.message?.usage;
    if (u) {
      // One API turn emits one event per content block, each carrying the same
      // usage. Counting events here overstates turns by ~2x; message.id does not.
      if (ev.message?.id) turnIds.add(ev.message.id);
      const ctx = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      if (ctx > peak) peak = ctx;
    }

    const content = ev.message?.content;
    const role = ev.message?.role;
    if (typeof content === 'string') {
      bump(role === 'user' ? 'your instructions' : 'assistant text', estTokens(content));
      continue;
    }
    if (!Array.isArray(content)) continue;

    for (const c of content) {
      if (c.type === 'text') {
        bump(role === 'user' ? 'your instructions' : 'assistant text', estTokens(c.text ?? ''));
      } else if (c.type === 'thinking') {
        bump('assistant thinking', estTokens(c.thinking ?? ''));
      } else if (c.type === 'tool_use') {
        const tok = estTokens(JSON.stringify(c.input ?? {}));
        bump('tool call parameters', tok);
        callName.set(c.id, c.name);
        const b = tool(c.name);
        b.params += tok; b.n++;
        // `max` spans BOTH directions. Tracking it on results only reported
        // Write's "file created" acknowledgement (63 tok) as its worst case,
        // hiding the multi-thousand-token payload that is the actual cost.
        if (tok > b.max) b.max = tok;
        if (tok >= FAT_RESULT) fat.push({ name: `${c.name} (params)`, tok });
        if (c.name === 'Write') {
          const p = (c.input?.file_path ?? '?').replace(/\\/g, '/').split('/').slice(-2).join('/');
          if (!writes.has(p)) writes.set(p, []);
          writes.get(p).push(estTokens(c.input?.content ?? ''));
        }
      } else if (c.type === 'tool_result') {
        const tok = estTokensOfResult(c);
        bump('tool results', tok);
        const name = callName.get(c.tool_use_id) ?? 'unknown';
        const b = tool(name);
        b.result += tok;
        if (tok > b.max) b.max = tok;
        if (tok >= FAT_RESULT) fat.push({ name, tok });
      }
    }
  }

  const total = [...cat.values()].reduce((s, b) => s + b.tok, 0);
  return { file, cat, tools, writes, fat, attach, total, peak, first, last, sidechain, dup, turns: turnIds.size };
}

/** Estimate a tool_result's tokens without materialising the joined string. */
function estTokensOfResult(c) {
  const collect = (x) => {
    if (typeof x === 'string') return estTokens(x);
    if (Array.isArray(x)) return x.reduce((s, y) => s + collect(y), 0);
    if (x && typeof x === 'object') {
      return typeof x.text === 'string' ? estTokens(x.text) : estTokens(JSON.stringify(x));
    }
    return 0;
  };
  return collect(c.content);
}

/**
 * The actionable half. Every finding names a specific, changeable behaviour —
 * a generic "you used a lot of context" produces no edit.
 */
export function findings(p) {
  const out = [];

  if (p.peak > BUDGET) {
    out.push(
      `peak ${p.peak.toLocaleString()} tok is ${(p.peak / BUDGET).toFixed(1)}x the ${BUDGET.toLocaleString()} budget ` +
        `-- split this into separate sessions, one roadmap step each (vault brief in, notes + decide out)`,
    );
  }

  const agent = p.tools.get('Agent');
  if (agent && agent.n && agent.result / agent.n > FAT_AGENT_REPORT) {
    out.push(
      `subagent reports average ${Math.round(agent.result / agent.n).toLocaleString()} tok (max ${agent.max.toLocaleString()}) ` +
        `-- a report over ${FAT_AGENT_REPORT} tok cancels the delegation; require refs + file:line, not prose`,
    );
  }

  let waste = 0;
  const rewritten = [];
  for (const [file, arr] of p.writes) {
    if (arr.length < 2) continue;
    const superseded = arr.slice(0, -1).reduce((a, b) => a + b, 0);
    waste += superseded;
    rewritten.push({ file, n: arr.length, superseded });
  }
  if (waste) {
    out.push(
      `${waste.toLocaleString()} tok of superseded file bodies still in context ` +
        `(${rewritten.length} file(s) written more than once) -- iterate with Edit, which averages ~240 tok against Write's ~1440`,
    );
    for (const r of rewritten.sort((a, b) => b.superseded - a.superseded).slice(0, 5)) {
      out.push(`    ${String(r.superseded).padStart(7)} tok  ${r.file}  (written ${r.n}x)`);
    }
  }

  const planRef = p.attach.get('plan_file_reference');
  const plan = p.tools.get('ExitPlanMode');
  const planTotal = (plan ? plan.params + plan.result : 0) + (planRef?.tok ?? 0);
  if (planTotal > 8_000) {
    out.push(
      `plan document cost ${planTotal.toLocaleString()} tok total ` +
        `(${plan?.n ?? 0} ExitPlanMode submission(s) + ${planRef?.n ?? 0} file re-injection(s)) ` +
        `-- keep the plan in a file, iterate with Edit, submit a summary plus its path`,
    );
  }

  const rem = p.attach.get('task_reminder');
  if (rem && rem.tok > FAT_REMINDER) {
    out.push(
      `task-list reminders cost ${rem.tok.toLocaleString()} tok across ${rem.n} injection(s) ` +
        `(avg ${Math.round(rem.tok / rem.n)}, max ${rem.max}) -- each one carries the WHOLE list, ` +
        `so close and delete finished tasks instead of letting them accumulate`,
    );
  }

  return out;
}

function renderOne(p, flags) {
  const L = [];
  const pct = (t) => `${((t / p.total) * 100).toFixed(1)}%`.padStart(6);
  const n = (t) => t.toLocaleString().padStart(9);

  L.push(`# vault ctx — ${path.basename(p.file)}`);
  L.push(`turns=${p.turns}  span ${p.first} .. ${p.last}`);
  L.push(`peak context ~${p.peak.toLocaleString()} tok  (budget ${BUDGET.toLocaleString()})   -- the real number, from API usage`);
  // These two differ and the difference is not an error: `total` is everything
  // the session ever produced, `peak` is the most that was resident at once.
  // Compaction and cache eviction sit between them.
  L.push(`est. transcript ${p.total.toLocaleString()} tok cumulative; the breakdown below apportions THAT, by chars-per-token heuristic (±15%)`);
  L.push(`excluded: ${p.sidechain} subagent-internal events, ${p.dup} duplicate events`);

  L.push('');
  L.push('## where the tokens went');
  for (const [k, b] of [...p.cat.entries()].sort((a, b) => b[1].tok - a[1].tok)) {
    L.push(`${n(b.tok)}  ${pct(b.tok)}  ${String(b.n).padStart(5)}x  ${k}`);
  }

  L.push('');
  L.push('## by tool  (results returned + parameters sent)');
  const rows = [...p.tools.entries()]
    .map(([k, b]) => ({ k, ...b, sum: b.result + b.params }))
    .sort((a, b) => b.sum - a.sum)
    .slice(0, Number(flags.n || 12));
  for (const r of rows) {
    L.push(
      `${n(r.sum)}  ${String(r.n).padStart(4)}x  avg ${String(Math.round(r.sum / r.n)).padStart(6)}` +
        `  max ${String(r.max).padStart(6)}  ${r.k}`,
    );
  }

  if (p.attach.size) {
    const sum = [...p.attach.values()].reduce((s, b) => s + b.tok, 0);
    L.push('');
    L.push(`## harness injections  (${sum.toLocaleString()} tok — nobody typed these)`);
    for (const [k, b] of [...p.attach.entries()].sort((a, b) => b[1].tok - a[1].tok)) {
      if (b.tok < 100) continue;
      L.push(`${n(b.tok)}  ${String(b.n).padStart(4)}x  avg ${String(Math.round(b.tok / b.n)).padStart(6)}  max ${String(b.max).padStart(6)}  ${k}`);
    }
  }

  if (p.fat.length) {
    L.push('');
    L.push(`## single items over ${FAT_RESULT.toLocaleString()} tok`);
    for (const f of p.fat.sort((a, b) => b.tok - a.tok).slice(0, 10)) {
      L.push(`${n(f.tok)}  ${f.name}`);
    }
  }

  const fs = findings(p);
  L.push('');
  if (fs.length) {
    L.push('## FINDINGS');
    for (const f of fs) L.push(f.startsWith('    ') ? f : `- ${f}`);
  } else {
    L.push('## FINDINGS: none — session stayed inside the context budget');
  }

  return L.join('\n');
}

export function ctx(root, flags = {}, positional = []) {
  // Every hook event receives `transcript_path` on stdin, so a caller that has
  // one can name the exact file rather than guessing the newest by mtime — and
  // this path never touches the projects directory, which may not exist.
  if (flags.transcript) {
    if (!existsSync(flags.transcript)) {
      process.stderr.write(`vault ctx: no transcript at ${flags.transcript}\n`);
      return 2;
    }
    return emitOne(profile(flags.transcript), path.basename(flags.transcript, '.jsonl'), flags);
  }

  const all = sessions(root);
  if (!all.length) {
    process.stdout.write(
      `vault ctx: no transcripts under ${projectDir(root)}\n` +
        'This reads Claude Code session logs; there are none for this project yet.\n',
    );
    return 0;
  }

  if (flags.list) {
    process.stdout.write(
      all
        .map((s) => `${new Date(s.mtime).toISOString().slice(0, 16)}  ${String(Math.round(s.bytes / 1024)).padStart(6)} KB  ${s.id}`)
        .join('\n') + '\n',
    );
    return 0;
  }

  // `--all` is a fleet view: one line per session, so a trend is visible
  // without profiling each in turn.
  if (flags.all) {
    const L = [`# vault ctx — ${all.length} session(s), newest first    budget ${BUDGET.toLocaleString()}`];
    let over = 0;
    for (const s of all) {
      const p = profile(s.abs);
      if (p.peak > BUDGET) over++;
      const bar = p.peak > BUDGET ? '  OVER' : '';
      L.push(`${String(p.peak).padStart(9)} tok  ${String(p.turns).padStart(4)} turns  ${s.id.slice(0, 8)}  ${(p.first ?? '').slice(0, 16)}${bar}`);
    }
    L.push('');
    L.push(`${over}/${all.length} session(s) over budget`);
    process.stdout.write(L.join('\n') + '\n');
    return 0;
  }

  const want = positional[0] ?? flags.session;
  const target = want ? all.find((s) => s.id.startsWith(String(want))) : all[0];
  if (!target) {
    process.stderr.write(`vault ctx: no session matching '${want}'. Try: vault ctx --list\n`);
    return 2;
  }

  return emitOne(profile(target.abs), target.id, flags);
}

/** One session's report in either format. Shared by the CLI and --transcript. */
function emitOne(p, id, flags) {
  if (flags.json) {
    process.stdout.write(
      JSON.stringify(
        {
          session: id,
          peak: p.peak,
          budget: BUDGET,
          turns: p.turns,
          categories: Object.fromEntries([...p.cat].map(([k, v]) => [k, v.tok])),
          tools: Object.fromEntries([...p.tools].map(([k, v]) => [k, v.result + v.params])),
          injections: Object.fromEntries([...p.attach].map(([k, v]) => [k, v.tok])),
          // Indented rows are detail under the preceding finding, not findings
          // in their own right — including them would triple the count.
          findings: findings(p).filter((f) => !f.startsWith('    ')),
        },
        null,
        2,
      ) + '\n',
    );
    return 0;
  }

  process.stdout.write(renderOne(p, flags) + '\n');
  // Exit 1 when over budget so this is usable as a check, not just a report.
  return flags.strict && p.peak > BUDGET ? 1 : 0;
}

export { BUDGET };
