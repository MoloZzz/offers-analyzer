/**
 * Rule registry + the `check` command.
 *
 * HARD CONTRACT: check() and everything it calls OPEN NO FILE FOR WRITING.
 * This is what makes the hook safe — it can never dirty the tree it validates.
 *
 * Every rule ships at `warn` and is promoted to `error` only once its count
 * reaches zero (see SEVERITY below). That staged rollout is what prevents the
 * new hook from blocking every commit on day one.
 */
import * as path from 'node:path';
import { VAULT_DIR, GEN_DIR, CODE_PREFIX, readText, readTextOrNull, exists, sortBy, cmp, norm, expandPatterns, resolveCodePattern, digestFiles } from './fs.mjs';
import { stagedPaths, worktreeDirty, git } from './git.mjs';
import { stripFences } from './notes.mjs';
// Safe to import statically: search.mjs is read-only apart from the gitignored
// retrieval log, which only find/show/brief touch — never rank/resolveRef.
import { rank, resolveRef, RefError } from './search.mjs';

/**
 * Promotion table. Flip a value to 'error' once `check` reports zero for it.
 * `check` exits 1 only on 'error' (or on anything, with --strict).
 */
export const SEVERITY = {
  'frontmatter-invalid': 'error',   // a parse failure is never acceptable
  'link-dangling': 'error',         // currently 0 — keep it that way
  'link-case': 'error',             // currently 0 — breaks on case-sensitive FS
  'entity-table-drift': 'error',    // migrations vs @Entity disagree
  'test-only': 'error',             // .only committed = silently skipped suite
  'legacy-code-without-vault': 'error',
  'legacy-index-status': 'error',
  'retrieval-regression': 'error', // green on all 15 rows of _retrieval.tsv
  // Blocks a commit touching code a note describes until that note is reviewed
  // and re-pinned. The ONLY rule that catches a note which agrees with the code
  // yet documents an approach that was abandoned; at 'warn' it is inert in
  // practice, which is why it is here. Escape: SKIP_VAULT_CHECK=1.
  'rev-stale': 'error',

  'note-unreachable': 'warn',
  'note-orphan': 'warn',
  'env-undocumented': 'warn',
  'autoblock-stale': 'warn',
  'status-leak': 'warn',
  'stale-planned': 'warn',
  'fact-restated': 'warn',
  'step-plan-drift': 'warn',
  'partial-stage': 'warn',
};

const sev = (rule) => SEVERITY[rule] || 'info';
const f = (rule, where, message) => ({ rule, where, message, severity: sev(rule) });

// Status VERBS only. Deliberately NOT `крок \d+` — `## crypto_purchases (крок 5)`
// is a scope label, not a status claim, and banning it produces instant false
// positives that get the rule disabled.
const STATUS_VERBS = /(реалізован|зроблено|готово|прогнан|зелен|завершено|наступне)/i;
const PLANNED_WORDS = /(planned|майбутн|планов|не реалізов|заплановано)/i;
const CODE_IDENT = /\b([A-Z]\w+(?:Provider|Service|Subscriber|Purchase|Entity))\b/g;

/**
 * All findings that are a pure function of the vault + code.
 * Deliberately EXCLUDES _gen freshness: health.txt embeds this output, so
 * including it would make the file's content depend on its own staleness.
 */
export function collectFindings(ctx) {
  const { notes, graph, env } = ctx;
  const out = [];

  // ---- graph integrity
  for (const d of graph.dangling) out.push(f('link-dangling', `${d.from}:${d.line}`, `[[${d.target}]] resolves to no note`));
  for (const c of graph.caseMismatch) out.push(f('link-case', `${c.from}:${c.line}`, `[[${c.target}]] differs in case from '${c.actual}' — breaks on case-sensitive filesystems`));
  for (const n of graph.unreachable) out.push(f('note-unreachable', n, 'not reachable from "00 — Index" by following links'));
  for (const n of graph.orphans) {
    if (n === '00 — Index') continue; // the hub is expected to have inDeg 0
    out.push(f('note-orphan', n, 'nothing links to this note'));
  }

  // ---- code/vault correspondence
  const entityTables = sortBy(ctx.entities.map((e) => e.table));
  const migTables = sortBy([...new Set(ctx.migrations.flatMap((m) => m.tables))]);
  for (const t of entityTables) {
    if (!migTables.includes(t)) out.push(f('entity-table-drift', t, `@Entity('${t}') has no CREATE TABLE in any migration`));
  }
  for (const t of migTables) {
    if (!entityTables.includes(t)) out.push(f('entity-table-drift', t, `migration creates "${t}" but no @Entity maps to it`));
  }
  for (const k of env.missing) out.push(f('env-undocumented', k, `used in ${CODE_PREFIX}src but absent from ${CODE_PREFIX}.env.example`));
  for (const o of ctx.tests.only) out.push(f('test-only', o, '.only/fit/ftest committed — the rest of the suite is silently skipped'));

  // ---- per-note content rules
  const codeIndex = codeSymbolIndex(ctx);
  for (const note of notes) {
    const isRoadmap = note.name === 'Roadmap & Status';
    const isPlan = note.type === 'plan';
    // Prose rules run over fence-stripped lines — a mermaid diagram or a code
    // sample is not prose and must not trip a prose rule. But `stale-planned`
    // runs over RAW lines: it requires a symbol that provably exists in
    // backend/src, which is precise enough not to false-positive inside a
    // fence, and a stale "planned" label in a diagram is still a stale label.
    const scanLines = stripFences(note.lines.join('\n')).split('\n');

    for (let i = 0; i < note.lines.length; i++) {
      const raw = note.lines[i];
      const line = scanLines[i] ?? '';
      const where = `${note.rel}:${i + 1}`;

      // stale "planned": a symbol that demonstrably exists in backend/src,
      // on a line that calls it planned/future.
      if (PLANNED_WORDS.test(raw)) {
        for (const m of raw.matchAll(CODE_IDENT)) {
          const hit = codeIndex.get(m[1]);
          if (hit) out.push(f('stale-planned', where, `claims ${m[1]} is planned/future, but it exists at ${hit}`));
        }
      }

      if (!line.trim()) continue;

      // Status leakage outside the single source of truth.
      // Three exemptions, each of which produced a false positive on the real
      // vault and would have got the rule switched off:
      //   - a line that LINKS to the roadmap is a pointer, not a claim
      //   - checkbox lines in Plans/ are acceptance criteria, not status; they
      //     are governed by step-plan-drift instead
      //   - explicit <!-- status-ok --> escape
      const isPointer = /\[\[Roadmap & Status/.test(line);
      const isPlanCriterion = isPlan && /^\s*-\s*\[[ xX]\]/.test(line);
      if (!isRoadmap && !isPointer && !isPlanCriterion && STATUS_VERBS.test(line) && !/<!--\s*status-ok\s*-->/.test(line)) {
        out.push(f('status-leak', where, `status claim outside Roadmap & Status: ${line.trim().slice(0, 90)}`));
      }
    }

    // rev pin freshness
    if (note.data?.code?.length && note.data?.rev) {
      const files = expandPatterns(ctx.root, note.data.code.map(resolveCodePattern));
      const actual = digestFiles(ctx.root, files);
      if (actual !== note.data.rev) {
        out.push(f('rev-stale', note.rel, `code it describes changed (rev ${note.data.rev} -> ${actual}); review the note, then: vault pin "${note.rel}"`));
      }
    }
  }

  out.push(...factRules(ctx));
  out.push(...stepRules(ctx));
  out.push(...retrievalRules(ctx));
  out.push(...legacyRules(ctx));

  return sortBy(out, (x) => `${x.severity}:${x.rule}:${x.where || ''}`);
}

/** Map of exported class name -> file path, for the stale-"planned" rule. */
function codeSymbolIndex(ctx) {
  const idx = new Map();
  for (const e of ctx.entities) idx.set(e.cls, e.file);
  for (const p of ctx.providers) idx.set(p.cls, p.file);
  for (const m of ctx.migrations) idx.set(m.cls, m.file);
  return idx;
}

// ---- _facts.tsv: key / owner / restate_regex / severity
function factRules(ctx) {
  const raw = readTextOrNull(path.resolve(ctx.root, VAULT_DIR, '_facts.tsv'));
  if (!raw) return [];
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [key, owner, restate] = line.split('\t').map((s) => (s || '').trim());
    if (!key || !owner || !restate) continue;
    const ownerRel = owner.split('#')[0];
    let rx;
    try { rx = new RegExp(restate, 'i'); } catch { continue; }

    const ownerName = ownerRel.replace(/\.md$/, '').split('/').pop();
    for (const note of ctx.notes) {
      if (note.rel === ownerRel) continue;
      for (let i = 0; i < note.lines.length; i++) {
        if (!rx.test(note.lines[i])) continue;
        // A restatement is allowed if it points at the canon. The pointer must
        // be in the same LOGICAL BLOCK, not the same physical line: prose here
        // wraps at ~95 chars, so a legitimate pointer routinely lands on the
        // continuation line. Block = the matched line plus following lines
        // until a blank line, a new list item, or a heading.
        let block = note.lines[i];
        for (let j = i + 1; j < note.lines.length; j++) {
          const nxt = note.lines[j];
          if (!nxt.trim() || /^\s*([-*+]|\d+\.)\s/.test(nxt) || /^#/.test(nxt)) break;
          block += '\n' + nxt;
        }
        if (block.includes(ownerName)) continue;
        out.push(f('fact-restated', `${note.rel}:${i + 1}`, `restates fact '${key}' (canon: ${owner}) with no canon pointer in this block`));
      }
    }
  }
  return out;
}

// ---- _steps.tsv: step / plan_note / evidence
function stepRules(ctx) {
  const raw = readTextOrNull(path.resolve(ctx.root, VAULT_DIR, '_steps.tsv'));
  if (!raw) return [];
  const roadmap = ctx.notes.find((n) => n.name === 'Roadmap & Status');
  if (!roadmap) return [];
  const checked = new Map();
  for (const line of roadmap.lines) {
    const m = line.match(/^\s*-\s*\[([ xX])\]\s*\*\*(\d+)\./);
    if (m) checked.set(m[2], m[1].toLowerCase() === 'x');
  }

  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [step, planNote, evidence] = line.split('\t').map((s) => (s || '').trim());
    if (!step) continue;
    const isDone = checked.get(step);
    if (isDone === undefined) continue;

    if (evidence && evidence !== '-') {
      const present = exists(path.resolve(ctx.root, evidence));
      if (isDone && !present) out.push(f('step-plan-drift', `step ${step}`, `marked [x] but evidence '${evidence}' does not exist`));
      if (!isDone && present) out.push(f('step-plan-drift', `step ${step}`, `marked [ ] but evidence '${evidence}' exists — step may be silently implemented`));
    }
    if (isDone && planNote && planNote !== '-') {
      const plan = ctx.notes.find((n) => n.rel === planNote);
      if (plan) {
        const open = plan.lines.map((l, i) => ({ l, i })).filter(({ l }) => /^\s*-\s*\[ \]/.test(l));
        if (open.length) {
          out.push(f('step-plan-drift', planNote, `roadmap step ${step} is [x] but this plan still has ${open.length} unchecked criteria (lines ${open.map((o) => o.i + 1).join(',')})`));
        }
      }
    }
  }
  return out;
}

// ---- _retrieval.tsv: query / expected_ref / mode
/**
 * Guards that search stays GOOD, not merely that the vault stays consistent.
 * Everything else here checks the corpus against itself or against the code;
 * nothing else notices when a `synonyms.tsv` edit or a weight change silently
 * degrades every future retrieval.
 *
 * Safe under the no-write contract: search.mjs only reads.
 */
function retrievalRules(ctx) {
  const raw = readTextOrNull(path.resolve(ctx.root, VAULT_DIR, '_retrieval.tsv'));
  if (!raw) return [];

  const rows = [];
  for (const line of raw.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [query, expected, mode] = line.split('\t').map((s) => (s || '').trim());
    if (query && expected) rows.push({ query, expected, mode: mode || 'top' });
  }
  if (!rows.length) return [];

  const out = [];
  for (const { query, expected, mode } of rows) {
    let want;
    try {
      want = resolveRef(ctx.notes, expected);
    } catch (err) {
      if (err instanceof RefError) {
        out.push(f('retrieval-regression', expected, `expected ref no longer resolves: ${err.message}`));
        continue;
      }
      throw err;
    }

    const hits = rank(ctx.root, ctx.notes, query, 8);
    // A note-level expectation is satisfied by any hit in that note; an
    // anchored expectation needs that exact heading.
    const matches = (h) =>
      h.note.rel === want.note.rel && (want.headingIndex === null || h.headingIndex === want.headingIndex);

    const at = hits.findIndex(matches);
    const actual = hits.length
      ? hits[0].headingIndex === null
        ? hits[0].note.rel
        : `${hits[0].note.rel}#${hits[0].note.headings[hits[0].headingIndex].text}`
      : '(no hits)';

    if (at === -1) {
      out.push(f('retrieval-regression', query, `expected '${expected}' in top 8, absent. #1 is '${actual}'`));
    } else if (mode === 'top' && at !== 0) {
      out.push(f('retrieval-regression', query, `expected '${expected}' at #1, found at #${at + 1}. #1 is '${actual}'`));
    }
  }
  return out;
}

/** The two rules the old sh hook enforced, reimplemented so nothing is lost. */
function legacyRules(ctx) {
  const out = [];
  if (!ctx.staged) return out;
  const codeRe = new RegExp(`^${CODE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(src|test)/`);
  const codeChanged = ctx.staged.filter((p) => codeRe.test(p));
  const vaultChanged = ctx.staged.filter((p) => p.startsWith(`${VAULT_DIR}/`));
  if (codeChanged.length && !vaultChanged.length) {
    out.push(f('legacy-code-without-vault', 'commit',
      `${CODE_PREFIX}src|test changed with no ${VAULT_DIR}/ change. Update at least Roadmap & Status.md; schema/architecture changes also need Architecture/. New decision -> Decision Log. Genuinely no-knowledge change (typo/rename): SKIP_VAULT_CHECK=1`));
  }
  const index = ctx.notes.find((n) => n.name === '00 — Index');
  if (index && /Наступне —|Кроки [0-9]/.test(index.body)) {
    out.push(f('legacy-index-status', index.rel, 'Index contains status text; status lives only in Roadmap & Status.md'));
  }
  return out;
}

// ------------------------------------------------------------------- check

export function check(root, flags = {}) {
  // Imported lazily so `check` never pulls in the writing paths at module load.
  return import('./render.mjs').then(({ buildContext, GEN_FILES, autoBlocks, fillBlocks }) => {
    const ctx = buildContext(root);
    ctx.root = root;
    if (flags.staged) ctx.staged = stagedPaths();

    const findings = collectFindings(ctx).filter((x) => !flags.rule || x.rule === flags.rule);

    // ---- generated-output freshness (checked here, never inside collectFindings)
    for (const [name, fn] of Object.entries(GEN_FILES)) {
      const p = path.resolve(root, GEN_DIR, name);
      const actual = readTextOrNull(p);
      const expected = norm(fn(ctx)).replace(/\n*$/, '\n');
      if (actual === null) findings.push(f('autoblock-stale', `${GEN_DIR}/${name}`, 'missing — run: npm run vault:build'));
      else if (norm(actual) !== expected) findings.push(f('autoblock-stale', `${GEN_DIR}/${name}`, `stale — run: npm run vault:build && git add ${GEN_DIR}`));
    }

    // ---- auto-block freshness inside hand-written files
    const blocks = autoBlocks(ctx);
    for (const note of ctx.notes) {
      const before = readText(path.resolve(root, note.path));
      if (fillBlocks(before, blocks) !== before) findings.push(f('autoblock-stale', note.rel, 'auto-block content is stale — run: npm run vault:build'));
    }

    if (flags.staged) {
      // The staged-vs-worktree hazard: build, stage only code, commit -> the
      // commit carries stale generated output while the worktree looks fine.
      const dirtyGen = worktreeDirty(`${VAULT_DIR}/_gen`);
      if (dirtyGen.length) {
        findings.push(f('autoblock-stale', 'commit', `unstaged changes in ${GEN_DIR}: ${dirtyGen.join(' ')} — run: git add ${GEN_DIR}`));
      }
      const dirtyNotes = worktreeDirty(VAULT_DIR).filter((p) => ctx.staged.includes(p));
      for (const p of dirtyNotes) findings.push(f('partial-stage', p, 'staged and further modified in the worktree; the commit will not contain what was validated'));
    }

    return report(findings, flags);
  });
}

function report(findings, flags) {
  const errors = findings.filter((x) => x.severity === 'error');
  const warns = findings.filter((x) => x.severity === 'warn');

  if (findings.length) {
    const lines = [];
    for (const sevName of ['error', 'warn', 'info']) {
      const list = findings.filter((x) => x.severity === sevName);
      if (!list.length) continue;
      lines.push(`--- ${sevName} (${list.length})`);
      for (const x of list) lines.push(`  [${x.rule}] ${x.where || '-'}: ${x.message}`);
    }
    process.stderr.write(lines.join('\n') + '\n');
  }

  const failing = flags.strict ? errors.length + warns.length : errors.length;
  process.stderr.write(`vault check: ${errors.length} error(s), ${warns.length} warning(s)${flags.strict ? ' [strict]' : ''}\n`);
  return failing ? 1 : 0;
}
