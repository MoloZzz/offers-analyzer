# Financial Transactions Aggregator

Personal finance tracker, single user. Pulls transactions (Monobank API, CSV), normalizes them
into one model, matches card outflow against crypto inflow (P2P), exports to Google Sheets.
Stack: NestJS + TypeORM + PostgreSQL. Code lives in `backend/`, the knowledge base in
`transaction-analytics/`.

Prose here is English (loaded on every request); note titles, headings and `[[wikilinks]]` stay
Ukrainian — they are **addresses** for `find`/`show`/`Read`, and a translated address cannot
resolve. Keep it that way when editing this file.

## Retrieval — how to read the knowledge base (INSTEAD of reading notes end to end)

**L1 — injected automatically.** `SessionStart`/`SubagentStart` hooks (`.claude/settings.json`)
feed you `_gen/context.txt`: invariants, status, entities, migrations, providers, env, tests, DoD.
Do not re-read it; if it is missing, read that file first. `SessionStart` alone also appends the
cached evidence digest (below); subagents do not get it, because a delegated task was already
chosen and a priority list is only an invitation to drift off it.

**L2 — locate:** `node tools/vault/v.mjs find "<query>"` → ranked `path#N :: heading`.
Query in English — `tools/vault/synonyms.tsv` is the en↔uk bridge.

**L3 — read ONE section:** `node tools/vault/v.mjs show "<ref>"`. Refs accept
`"Data Model#crypto_purchases"`, `"Data Model#5"` (positional) or `"matching#2"` (substring), so
you never type `↔` or `—` into a shell. A truncated section footer gives exact `offset`/`limit`
for a precise partial `Read`.

**L4 — full `Read`: only when about to EDIT that note.** A `PostToolUse` hook logs every full
note read; `vault log` reports L4 reads against L3 calls.

**Before editing `backend/src` or `tools/vault`, read `_gen/code-map.txt`** (file → exported
symbols, generated) instead of grepping. Never read `backend/dist/`.

**Subagents:** pass refs (`Data Model#5`), never paste note bodies. `SubagentStart` primes them;
`vault brief <ref>...` adds named sections in one call.

## Key invariants (generated from `Architecture/Invariants.md` — do not hand-edit)
<!-- auto:invariants begin -->
- 1. Money is always integers in minor units, never float
- 2. Dates are UTC in the DB
- 3. The core does not know about the source
- 4. Dedup and multi-tenancy
- 5. Matching is a separate post-processing stage
- 6. Side effects — only through events
- 7. Secrets — env/secrets only
<!-- auto:invariants end -->

Full text: [[Invariants]]. This block is generated, so it cannot diverge from the note.

## Commands (from `backend/`)
<!-- auto:cmds begin -->
- `npm run build`
- `npm run test`
- `npm run test:int`
- `npm run lint`
- `npm run migration:run`
- `npm run sync`
- `npm run match`
- `npm run db:up`
<!-- auto:cmds end -->

`npm run lint` is `eslint --fix` — it **modifies files**; never call it from a hook.
Test counts live in `_gen/context.txt`, not in the notes.

## Vault tooling (`node tools/vault/v.mjs <cmd>`)
`vault.config.json` at the repo root binds the (project-agnostic) tooling to this project:
`vaultDir`, `codeRoot`, the `adapter` supplying stack facts, and the `## STACK` text of the L1
pack. It is found by walking up from the cwd. Stack knowledge lives in
`tools/vault/adapters/` — `nest-typeorm` here, `none` for a stack with no adapter yet, which
omits the CODE/ENV/CMDS sections rather than failing.
```
build      regenerate _gen/* and auto-blocks (WRITES)
check      validate; writes NOTHING (this is the git hook)
pin <note>                       re-pin rev: after the code it describes changed
decide "<line>" --section <sub>  append a row to Decision Log
log [--misses]                   retrieval misses, truncations, L4 reads
ctx [--all] [--history] [--strict]  where this session's tokens went; exit 1 over budget
evidence [--dry] [--json]        run `_metrics.tsv` against the live DB; ranks plans by data
```

`evidence` is the Observe stage of the product loop: it answers **which plan the data justifies
now**, so priorities are measured rather than asserted. A fired trigger means *act on that plan*.
It reads live data, so the **measurement** is deliberately not part of `check` and never runs in a
hook, and its output is gitignored (`tools/vault/.evidence.tsv`) — it describes this machine's
data, not repo state. Numbers are directional, never statistical: one user, small n. A plan with
no metric (Plan 00) is decided by judgement — absence of a row is not evidence against it.

What the hook injects is that **cached file**, never a query — so session start costs nothing and
works with the database down. A cached run goes stale two ways: older than 14 days, or
`_metrics.tsv` changed since it ran (the output stamps a digest of the parsed metrics, so
rewording a comment does not invalidate it). Either way the block stops reporting numbers and asks
for a re-run — if you see that and you are choosing what to build, run `vault evidence` first.
From `backend/`, also as `npm run vault:build|check|find|show|brief|log|decide|ctx`.

Use `decide` for **rejected** approaches too — what a previous agent tried and discarded has no
other home in the vault, and it is the thing most often re-derived from scratch.

## Context budget — 50k per session, measured by `vault ctx`

Profiled on a real 282k session: this file plus the L1 pack were **under 1%** of it. Retrieval was
never the expensive part — the work is, and 22% was harness injections nobody typed. Run
`vault ctx` when a session feels heavy; it names the specific calls to change.

1. **One roadmap step per session.** The vault *is* the handoff — `brief` in, note edits +
   `decide` out, then clear the context. A 250k session is ten tasks that should have been five
   sessions; nothing is lost, because the durable state is in `transaction-analytics/`.
2. **Subagent reports ≤30 lines:** `file:line`, refs, decisions, what failed. Never code bodies,
   never a restated plan. A 12k-token report costs more than the delegation saved — the refs rule
   applies to what comes **back**, not only what goes in.
3. **Plans live in a file.** Iterate with `Edit`; `ExitPlanMode` gets a summary plus the path.
   Three full submissions of one plan cost 34k here.
4. **`Edit`, never `Write`, on a file that already exists** — measured 293 vs 1,610 tok/call. A
   rewritten file leaves its entire superseded body in context for the rest of the session.
5. **Close and delete finished tasks.** Every reminder re-injects the *whole* list (23k tok over
   31 injections in one session). Durable status belongs in [[Roadmap & Status]], not a task list.

**Rules 2 and 4 are now enforced, not advised.** Hooks in `.claude/settings.json` measure the live
peak every turn and warn **once** per threshold crossed (60% / 100% / 150%), never repeating — a
notice that re-fires every turn would be defect 5 above. Past 100% a `PreToolUse` gate refuses
`Write` on a file that already exists, and full `Read`s of notes you have not `show`n first; each
refusal names its own escape, and `VAULT_CTX_OFF=1` lifts all of them. Subagents are handed the
≤30-line report contract at start. No hook can compact or clear the window: the governor measures,
warns and refuses — that is the whole of it. `vault ctx --history` shows the trend across sessions.

## Definition of Done (every task)
Canon: [[Roadmap & Status]] § «Definition of Done», plus `vault check` clean. Not duplicated
here — there used to be 3 divergent versions.

## Vault discipline (ENFORCED — `vault check` guards every rule below)
A task is not done until the vault is updated; that is part of DoD.

1. `Roadmap & Status.md` is the **only source of truth for status**. Status verbs
   (“implemented”, “rejected”, “green”) elsewhere trip `status-leak`. A scope label
   (“step 5”) is fine — that is not a status claim.
2. Schema/entities → `Architecture/Data Model.md`; sync/providers/events → the matching
   `Architecture/` note. Changing code under a note's `code:` makes its `rev:` stale
   (`rev-stale` is an **error**, it blocks the commit): review the note, then `vault pin`.
   You cannot pin a note you did not edit.
3. Every new architectural decision → `vault decide`.
4. A fact owned in `_facts.tsv` must not be restated without a canon pointer (`fact-restated`).
5. Roadmap step ↔ plan are cross-checked via `_steps.tsv`: a closed step whose plan still has
   unchecked criteria is an error.
6. `_gen/*` is committed with the change; the hook rejects a stale `_gen`.
7. `_retrieval.tsv` is the ranking baseline — edit `synonyms.tsv` or the weights and
   `retrieval-regression` tells you what broke.

Bypass: `SKIP_VAULT_CHECK=1 git commit ...`, justified in the commit message.

## Setup after cloning
`npm install` in `backend/` arms the git hook (`prepare` → `vault init-hooks`). By hand:
```bash
git config core.hooksPath .githooks
```

## RTK — compact output for bash commands
**Golden rule: prefix bash commands with `tools/rtk`** (git/grep/find/ls/npm run/tsc/lint/jest).
If a filter exists it applies, otherwise passthrough — always safe, works in `&&` chains. If
missing: `cp tools/rtk-cli tools/rtk && chmod +x tools/rtk`. Full reference: `tools/rtk.md`
(read on demand, do not keep it in context).
