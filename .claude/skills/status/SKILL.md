---
name: "status"
description: "Answer status, roadmap, prioritization, and 'what is the next task to implement' questions from the maintained vault artifacts on a fixed, bounded retrieval path. Use for any planning-type question about this project."
argument-hint: "Optional focus, e.g. 'scoring' or 'budget'"
compatibility: "Requires knowledge-offers-analyzer/ vault and tools/vault/"
metadata:
  author: "offers-analyzer"
  rationale: "knowledge-offers-analyzer/decisions/0021-retrieval-discipline-by-default.md"
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

## Purpose

Planning questions — "what's the status", "what's next", "what should I implement", "what's
blocked", "what's the plan" — are answered from **maintained planning artifacts**, not by
re-deriving project state from source code. Those artifacts exist, are kept current by the write
protocol in `CLAUDE.md` §1, and are authoritative for this class of question.

This skill exists because that judgment was previously made ad-hoc and got it wrong: one
`what is the next task to implement` run cost ~135k tokens, most of it raw `src/` reading, when
the same answer was available in ~3k. The fix is a fixed path, not a reminder to be careful.

## Procedure

Run these **in order**. Stop at the first step that fully answers the question.

**Step 1 — orientation (almost always sufficient).**

```bash
npm run vault:brief -- "Roadmap & Status"
```

~2.5k tokens. Returns routes, stack, checkbox status, code counts (entities, migrations, tests),
environment, quality commands, and the whole `Roadmap & Status` note — including its `Next`
section. For most "what's next" questions **this is the complete answer. Stop here.**

**Step 2 — current handoff, only if step 1 left the question open.**

```bash
npm run vault:show -- "Roadmap & Status#Next"
cat knowledge-offers-analyzer/context/CURRENT.md
```

`CURRENT.md` is excluded from the generated graph and search on purpose, so it is read directly.
It carries in-flight work and handoff state that the roadmap does not.

**Step 3 — locate the owning note, only for a specific sub-area.**

```bash
npm run vault:find -- "<query>"
npm run vault:show -- "<Note>#<section>"
```

Ranked references, then one bounded section. Not whole notes.

**Step 4 — spec or decision detail, only when the question is about a specific feature's scope.**

`knowledge-offers-analyzer/specs/README.md` maps every spec to its status in one table. Formal
specs live at repo-root `specs/<id>/spec.md` (Spec-Kit's own location — this is correct, not
drift). ADRs own decisions; read the single relevant ADR, not the directory.

## Hard rules

- **Do not read files under `src/` to answer a planning question.** If you believe you need
  implementation detail, use `knowledge-offers-analyzer/_gen/code-map.txt` (~4.5k tokens) — it is
  the maintained substitute for source exploration. Reading all of `src/` costs ~123k tokens.
- **Do not grep the codebase** to establish what is implemented. Spec status is recorded in
  `specs/README.md` and `Roadmap & Status`.
- **Escalating past this path requires a stated reason.** Exactly two are valid: (a) the user
  asked for verification against the implementation, or (b) you found concrete evidence an
  artifact is stale — a specific contradiction, not a general worry. Say which one, and name the
  contradiction, **before** the first source read.
- **Stop when the question is answered.** Do not add confirmation passes. Verifying a maintained
  artifact against source is the expensive failure this skill prevents.

## If an artifact is stale

Staleness is a **defect to fix**, not a reason to abandon the vault. Per `CLAUDE.md` §1 write
protocol, correct the note in the same task, then run `npm run vault:build` and
`npm run vault:check:strict`. Report the drift to the user — a planning artifact that lost the
project's trust is worth more attention than the immediate question.

## Shell note

Under the Claude Code CLI, the `PreToolUse` hook rewrites Bash to RTK automatically. Elsewhere
(Cowork), prefix commands with **`tools/rtk`** — bare `rtk` is not on `PATH` and fails.
