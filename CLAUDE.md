# CLAUDE.md — Offers Analyzer operating rules

These rules are **mandatory** for any agent working in this repository. They bind
together three practices: the **knowledge vault** (navigation + memory),
**Spec-Driven Development** (how features are built), and **RTK** (token-efficient
commands). Rationale: `knowledge-offers-analyzer/decisions/0001-adopt-sdd-vault-rtk.md`.

---

## 1. Knowledge base first (second brain) — REQUIRED

The Obsidian vault at `knowledge-offers-analyzer/` is the **primary navigation
layer** for this project. It is not optional documentation; it is how you find
your way around.

The vault has **two layers**: the **curated** notes (source of truth, navigated
via `[[links]]`) and a **decoupled context zone** (`context/`) for goals, session
logs, and drafts — deliberately kept out of the navigation graph so it never
dilutes it. Rules: `context/README.md`.

`tools/vault/` makes that navigation executable without replacing it. The generated
`knowledge-offers-analyzer/_gen/` artifacts are reproducible navigation aids, never a second
source of truth. `vault build` is the only normal writer and `vault check` is write-free; the
explicit, advisory `vault evidence` command may only write its ignored local observation cache.

**Read protocol — before touching code, every task:**
1. Skim `knowledge-offers-analyzer/context/goals.md`, `context/CURRENT.md`, and the latest
   `context/log/*` for background.
2. Run `npm run vault:brief -- "Roadmap & Status"` for L1 orientation. If generated artifacts
   are absent or stale, run the explicit `npm run vault:build` first; never expect `brief` or
   `check` to write them for you.
3. Open `knowledge-offers-analyzer/00-INDEX.md` and follow its Maps of Content into the area
   you're working on. Use `npm run vault:find -- "<query>"`, then
   `npm run vault:show -- "<note>#<section>"` for L2/L3 retrieval.
4. Let the notes point you to the right files. Read a full note or source file only at L4, when
   implementation detail or an edit requires it; do **not** default to broad codebase grepping.

**Planning questions stop at L3.** For status, roadmap, prioritization, backlog, or "what should
I do next" questions, `Roadmap & Status`, `context/CURRENT.md`, and `_gen/code-map.txt` are
**authoritative** — do not re-derive project state from source. Escalate to L4 only if the user
asked for verification against the implementation, or you hit concrete evidence a note is stale;
**state which of the two applies, and why, before opening the first source file.** `/status` is
the standard path for this class of question — prefer it over ad-hoc exploration.

When delegating, pass note references and a target question rather than pasting large note bodies.
Every runtime, including Codex Desktop, follows this explicit L1-to-L4 protocol; Claude hooks are
not assumed to run.

**Write protocol — a task is NOT done until the vault reflects the change:**
- Capture running context/decisions in today's `context/log/YYYY-MM-DD-*.md`.
- **Promote** anything durable out of `context/` into the curated notes below
  (the context zone is an inbox, not a destination).
- New module/feature → update `architecture/overview.md`.
- New domain concept or rule → update `domain/glossary.md`.
- Non-trivial decision → add an ADR (`decisions/`, copy `adr-template.md`).
- New convention/pattern → update `conventions/coding-standards.md`.
- New tool/env/runbook step → update `operations/environment-setup.md`.
- New spec → link it from `specs/README.md`.
- Update generated artifacts with `npm run vault:build` whenever curated notes, source-fact
  surfaces, the adapter, or vault configuration changes; then run strict validation.

**Supersession sweep (REQUIRED whenever a decision changes).** A new ADR — or any
edit that supersedes, reverses, or narrows a prior decision — is NOT done until
**every note that repeated the old fact is updated in the same task**. Before
closing such a task you MUST `rtk grep` the vault for the superseded fact (e.g. a
dropped library, renamed concept, changed default) and fix each hit. The usual
offenders are the notes that *duplicate* decisions rather than own them —
`context/goals.md` (the "Stack"/north-star), `architecture/overview.md`, and
`domain/glossary.md`. A vault where one note contradicts an ADR is a defect, not a
stale doc. (Concrete example: ADR-0004 dropped Redis/BullMQ; goals.md kept listing
them — exactly the drift this rule exists to prevent.)

Full rules: `knowledge-offers-analyzer/_meta/vault-protocol.md`. If a note is
missing or contradicts the code, fixing it is part of your task. This is a
**second-brain** approach, deliberately chosen over vector RAG (inefficient and
noisy at this scale).

**Evidence is advisory only.** `npm run vault:evidence -- --dry` validates the metric registry
without a database. A real `vault:evidence` run uses a read-only transaction and must be invoked
deliberately; no evidence result authorizes scoring, profile, budget, or rollout changes.

## 2. Spec-Driven Development (SDD) — REQUIRED for non-trivial features

Features go through **Spec Kit** before implementation. Do not jump to code for
anything non-trivial.

Workflow (slash-command skills in `.claude/skills/`):
`/speckit-constitution` (once) → `/speckit-specify` → `/speckit-clarify` (optional)
→ `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` (optional) → `/speckit-implement`.

Supporting files live in `.specify/` (constitution, templates, scripts). The
specification is the source of truth; code is the downstream artifact. Reflect
implemented specs back into the vault (§1).

## 3. RTK — REQUIRED for shell commands

Run shell commands through **RTK** (`tools/rtk`) to strip noisy output (tests,
tsc, lint, git, grep) before it reaches context — 60–90% token savings.

- Under the **Claude Code CLI**, the `PreToolUse` hook in `.claude/settings.json`
  rewrites Bash commands to `rtk …` automatically. Requires a **Linux/WSL**
  environment with `rtk` on `PATH` (the binary is Linux/musl; setup:
  `operations/environment-setup.md`).
- Where hooks do not run (e.g. Cowork), **prefix commands with `tools/rtk` yourself**:
  `tools/rtk npm test`, `tools/rtk git diff`, `tools/rtk tsc`, `tools/rtk grep …`. Use the
  **path, not bare `rtk`** — outside a Linux/WSL shell where it was installed on `PATH`, bare
  `rtk` is "command not found", which silently degrades to raw, unfiltered output. The binary
  itself runs fine in Cowork (`./tools/rtk --version` → `rtk 0.42.4`).
- Where RTK itself is unavailable (for example, a Windows-only agent runtime), run the
  native equivalent and state the fallback in the task record. Do not block a quality
  gate solely because the Linux/musl wrapper cannot run.
- Full command reference and rules: **@.claude/RTK.md**.

## 4. Delegate independent work to subagents — REQUIRED when the trigger holds

**Trigger:** the work is independent of other in-flight slices, its contract (files, signatures,
acceptance test) is already decided, and the result is cheaply verifiable. Every `[P]` task in
`tasks.md` and every bounded lookup qualifies by construction.

When it holds, dispatch a named agent from `.claude/agents/` instead of doing the work in the main
context: `oa-researcher` / `oa-vault-scribe` (haiku, read-only), `oa-implementer` (sonnet, one
slice), `oa-verifier` (sonnet, read-only). Pass **note references and a target question, never
pasted note bodies**. Read-only agents may run in parallel; **write-capable agents run one at a
time** on the shared tree.

**Never delegate** spec authorship, ADRs, prioritization, evidence-gated scoring/threshold changes,
or the §1 write protocol — subagents report durable facts in a `VAULT:` line and the orchestrator
promotes them.

Full rules, model tiers, and brief format: `knowledge-offers-analyzer/conventions/delegation.md`
(ADR-0022). Where a runtime has no subagent mechanism, work in-context and state the fallback.

---

## Definition of done (every task)

1. Code/spec change complete.
2. Commands were run via RTK.
3. The **vault is updated** to reflect the change (§1 write protocol), **and the
   supersession sweep has been run** if any decision changed — no note may
   contradict an ADR (§1).
4. Run `npm run vault:build` when source/vault inputs affect generated artifacts, then
   `npm run vault:check:strict`; `npm run vault:check` retains the legacy compatibility check.
5. For features: the SDD artifacts under `.specify/` are consistent with the code.
6. Any delegated slice is recorded in today's context log (agent, model, slice), and every
   `VAULT:` line a subagent returned has been promoted to its owning note (§4). An unpromoted
   `VAULT:` line means the task is not done.
