/**
 * Claude Code hook adapters.
 *
 * These make the retrieval protocol structural instead of advisory:
 *
 *   session-start / subagent-start
 *     Inject `_gen/context.txt` automatically. L1 previously depended on the
 *     agent CHOOSING to read a file, which was the weakest link in the whole
 *     design. `subagent-start` is the one that matters most for cross-agent
 *     context retention — a child agent is primed before it does anything.
 *
 *   post-read
 *     Fires after a Read. The CLI cannot observe Read calls, so `show` ->
 *     full Read (an L3->L4 escalation) was unmeasurable from inside the tool;
 *     the hook layer can see it, so this is where that signal is captured.
 *     It also emits a short nudge back to the agent.
 *
 *   ctx-guard / ctx-gate / session-end / pre-compact
 *     The context governor. `ctx` reports where a session's tokens went, but
 *     only afterwards and only when asked; these run it continuously and act on
 *     the answer. ctx-guard warns ONCE per threshold crossed, ctx-gate denies
 *     the two measured worst spending patterns once over budget, session-end
 *     records the trend for free, pre-compact records the failure. See guard.mjs
 *     for what this deliberately does NOT claim to do.
 *
 * CONTRACT: every path here exits 0 and never throws. A hook that crashes or
 * blocks is worse than no hook — PostToolUse runs on every single Read, and
 * PreToolUse now runs in front of every Read and Write.
 *
 * Schema verified against the installed Claude Code and the current docs:
 * hookSpecificOutput is a discriminated union on hookEventName; SessionStart /
 * SubagentStart / PostToolUse / UserPromptSubmit accept `additionalContext`;
 * PreToolUse takes `permissionDecision` + `permissionDecisionReason`;
 * SessionEnd stdout is NOT added to context; PreCompact supports neither.
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { readTextOrNull, toPosix, GEN_DIR } from './fs.mjs';
import { digest } from './evidence.mjs';
import { logEvent } from './log.mjs';
import { BUDGET, profile, findings } from './ctx.mjs';
import {
  GATE_TIER,
  REMEASURE_BYTES,
  appendHistory,
  disabled,
  isVaultNote,
  markAnnounced,
  measure,
  noteCompaction,
  readVerdict,
  writeVerdict,
} from './guard.mjs';

const EVENT = {
  'session-start': 'SessionStart',
  'subagent-start': 'SubagentStart',
  'post-read': 'PostToolUse',
  'ctx-guard': 'UserPromptSubmit',
  'ctx-gate': 'PreToolUse',
  'session-end': 'SessionEnd',
  'pre-compact': 'PreCompact',
};

/**
 * Primed into every subagent. The cause of an oversized report is that nobody
 * told the child the rule; measured today, reports average 4,946 tok and peaked
 * at 12,278 — past roughly 2,000 the report costs more than the delegation saved.
 */
const REPORT_CONTRACT =
  'Report contract: <=30 lines. Give file:line, vault refs, decisions taken, and what failed. ' +
  'Never paste code bodies and never restate the plan.';

function emit(hookEventName, additionalContext) {
  if (!additionalContext) return 0;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext } }) + '\n');
  return 0;
}

/** Read the hook payload from stdin. Returns {} if there is nothing to read. */
function stdinJson() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function contextPack(root) {
  const txt = readTextOrNull(path.resolve(root, GEN_DIR, 'context.txt'));
  if (!txt) return null;
  return `${txt.trim()}\n\nThis is L1, injected automatically. Do not re-read context.txt.`;
}

/**
 * PreToolUse verdict. Emitting NOTHING is the allow path, so the gate stays
 * literally free for a session that is inside its budget.
 */
function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }) + '\n',
  );
  return 0;
}

/**
 * The tier-crossing notice. Kept deliberately short: this tool has no business
 * spending real context to complain about context. The full profile runs here
 * and only here — at most three times in a session, when there is finally
 * something specific to say.
 */
function notice(transcriptPath, m) {
  const L = [`CONTEXT ${m.peak.toLocaleString()} tok = ${(m.peak / BUDGET).toFixed(1)}x the ${BUDGET.toLocaleString()} budget.`];
  try {
    const p = profile(transcriptPath);
    const top = [...p.cat.entries()].sort((a, b) => b[1].tok - a[1].tok)[0];
    if (top) L.push(`Biggest: ${top[0]} ${top[1].tok.toLocaleString()}.`);
    const f = findings(p).find((x) => !x.startsWith('    ') && !x.startsWith('peak '));
    if (f) L.push(`${f.slice(0, 180)}.`);
  } catch {
    /* the headline alone is still actionable */
  }
  if (m.tier >= GATE_TIER) {
    L.push('Write-on-existing and full note Reads are now gated. Finish this step, then start a fresh session.');
  }
  return L.join(' ');
}

/** PreToolUse: deny the two measured worst spending patterns, once over budget. */
function gate(root) {
  if (disabled()) return 0;
  const payload = stdinJson();
  // The tier cannot move meaningfully inside 32 KB of transcript, and this runs
  // in front of every Read — so the overwhelming majority of calls scan nothing.
  const m = measure(root, payload.transcript_path, payload.session_id, { minGrowth: REMEASURE_BYTES });
  if (m.tier < GATE_TIER) return 0;

  const file = payload?.tool_input?.file_path;
  const reason =
    payload.tool_name === 'Write'
      ? writeVerdict(root, file)
      : payload.tool_name === 'Read'
        ? readVerdict(root, file)
        : null;
  return reason ? deny(reason) : 0;
}

/** UserPromptSubmit: speak only when a threshold is crossed for the first time. */
function budgetNotice(root, hookEventName) {
  if (disabled()) return 0;
  const payload = stdinJson();
  const m = measure(root, payload.transcript_path, payload.session_id);
  // Edge-triggered, not level-triggered. Re-announcing every turn would be
  // precisely the task_reminder defect this feature exists to detect: 23,033
  // tok across 31 injections, each one re-sending the entire list.
  if (!m.tier || m.tier <= (m.announced ?? 0)) return 0;
  markAnnounced(root, payload.session_id, m.tier);
  return emit(hookEventName, notice(payload.transcript_path, m));
}

/** SessionEnd: stdout is not added to context here, so this row costs nothing. */
function record(root) {
  const payload = stdinJson();
  // No session id means no measurement to attribute; a row of zeroes is noise
  // in the one file whose whole value is a readable trend.
  if (!payload.session_id) return 0;
  measure(root, payload.transcript_path, payload.session_id); // final refresh
  appendHistory(root, payload.session_id, { reason: payload.reason });
  return 0;
}

/** PreCompact: never blocks; it records the failure and rebaselines the peak. */
function compaction(root) {
  const payload = stdinJson();
  noteCompaction(root, payload.session_id, payload.transcript_path);
  return 0;
}

export function hook(root, which) {
  const hookEventName = EVENT[which];
  if (!hookEventName) {
    process.stderr.write(`vault hook: unknown event '${which}' (expected: ${Object.keys(EVENT).join(', ')})\n`);
    return 0; // never fail the session over a misconfigured hook
  }

  try {
    if (which === 'ctx-gate') return gate(root);
    if (which === 'ctx-guard') return budgetNotice(root, hookEventName);
    if (which === 'session-end') return record(root);
    if (which === 'pre-compact') return compaction(root);

    if (which === 'post-read') {
      const payload = stdinJson();
      const file = payload?.tool_input?.file_path;
      if (!file) return 0;

      const rel = toPosix(path.isAbsolute(file) ? path.relative(root, file) : file);
      if (!isVaultNote(rel)) return 0;

      // The measurement the CLI could not take: a full note Read is L4.
      logEvent(root, { cmd: 'read', arg: rel, outcome: 'l4', detail: 'full note Read' });

      return emit(
        hookEventName,
        `Retrieval note: '${rel}' was read in full (L4). L4 is for editing a note. ` +
          `To consult one, prefer: node tools/vault/v.mjs show "<Note>#<anchor>" — one section, ` +
          `with exact Read offsets in the footer if it truncates.`,
      );
    }

    const pack = contextPack(root);
    // A subagent is the one place the report contract can be stated before the
    // report is written, which is the only moment it can still change anything.
    //
    // It is also deliberately the one place the evidence block is NOT sent: a
    // subagent is doing a task somebody already chose, and handing it a list of
    // what the data says is more important is an invitation to the scope drift
    // the report contract above exists to prevent.
    if (which === 'subagent-start') {
      return emit(hookEventName, pack ? `${pack}\n\n${REPORT_CONTRACT}` : REPORT_CONTRACT);
    }
    return emit(hookEventName, [pack, digest(root)].filter(Boolean).join('\n\n'));
  } catch {
    return 0;
  }
}
