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

**Read protocol — before touching code, every task:**
1. Skim `knowledge-offers-analyzer/context/goals.md` and the latest
   `context/log/*` for background.
2. Open `knowledge-offers-analyzer/00-INDEX.md` and follow its Maps of Content
   into the area you're working on.
3. Let the notes point you to the right files. Do **not** default to broad
   grepping the codebase — navigate via the vault's `[[links]]`.

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
- Where hooks do not run (e.g. Cowork), **prefix commands with `rtk` yourself**:
  `rtk npm test`, `rtk git diff`, `rtk tsc`, `rtk grep …`.
- Full command reference and rules: **@.claude/RTK.md**.

---

## Definition of done (every task)

1. Code/spec change complete.
2. Commands were run via RTK.
3. The **vault is updated** to reflect the change (§1 write protocol), **and the
   supersession sweep has been run** if any decision changed — no note may
   contradict an ADR (§1).
4. For features: the SDD artifacts under `.specify/` are consistent with the code.
