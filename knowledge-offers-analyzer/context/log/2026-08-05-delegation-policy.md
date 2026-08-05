---
title: 2026-08-05 — Codify subagent delegation as mechanism (ADR-0022)
type: context-log
updated: 2026-08-05
---

# 2026-08-05 — Codify subagent delegation

## Ask

> "Update instructions/skills/conventions to use sub-agents (preferably cheaper, or depending on
> the task) during implementation, planning, or in all cases where it is rational — we need to
> start subagents to keep the context window wider and, during task implementation, have clear
> context for independent tasks."

## What was found first

The practice already existed and worked: spec-002 shipped almost entirely delegated (E1a, E1b,
E2a, E2b, E2d, E3a, E3b-2, E3b-3b, E4a, E4b), plus B12, B16, B21a, B22 — all recorded as
*"delegated → Sonnet"* in `context/log/2026-07-17-session-01.md`, with `poll.service.ts` kept
in-house as delicate.

**It was nowhere in policy.** A grep of `_meta/`, `conventions/`, `decisions/`, and
`.specify/memory/constitution.md` for *delegat* / *subagent* returned zero hits. So the rule lived
only in the operator's head: it varied by session, it did not transfer to a fresh runtime, and the
same 07-17 log shows the orchestrator running raw `npx tsc`/`npx jest` while its subagents
correctly used `./tools/rtk` — the briefed work followed the rules better than the briefing context
did.

## Decisions taken (with the operator, before writing)

Three choices were put to the operator rather than assumed:

1. **Mechanism, not prose** — agent definitions with the model pinned in frontmatter, plus a short
   trigger rule. This follows [[0021-retrieval-discipline-by-default|ADR-0021]], which rejected a
   350-word exhortation block in `CLAUDE.md` for exactly this reason.
2. **Three tiers** — haiku for retrieval/sweeps, sonnet for build and verify, opus orchestrator for
   spec authorship, ADRs, prioritization, and delicate files.
3. **Parallel reads, serialized writes** — worktree isolation for concurrent writers was declined;
   it buys wall-clock speed at the cost of a merge step and append-only migration collisions, and
   the goal here is context width, not speed.

## Changed

- **`.claude/agents/`** (new): `oa-researcher` (haiku), `oa-vault-scribe` (haiku),
  `oa-implementer` (sonnet), `oa-verifier` (sonnet). Each carries its binding rules (`tools/rtk`
  never bare `rtk`, append-only migrations, coding standards) and a **compact return contract** —
  an agent that returns a wall of text has spent the context its use was meant to save.
- **`conventions/delegation.md`** (new) — owns the rule: tiers, the four-part trigger, the brief
  format, the never-delegate list, and what the orchestrator does with a report.
- **`CLAUDE.md` §4** (new, ~150 words) + DoD item 6; **`AGENTS.md`** item 6.
- **`/speckit-plan`** — Phase 0 research dispatches parallel `oa-researcher` agents; a
  `CONFIDENCE: low` or non-empty `OPEN` line keeps the unknown as NEEDS CLARIFICATION.
- **`/speckit-tasks`** — `[P]` is now also the delegation marker; `[P]` tasks must be briefable as
  written, and must not cover evidence-gated scoring changes.
- **`/speckit-implement`** — step 6a delegation protocol, `oa-verifier` on every behavior change,
  step 9a promotes returned `VAULT:` lines. Corrected the old *"parallel tasks [P] can run
  together"*, which contradicts the serialized-write rule.
- **Constitution 1.3.0 → 1.4.0** — Principle VII broadened from *Token-Efficient Tooling (RTK)* to
  *Context Economy*; workflow gate 7 added (independent verification + recording).
- **`_meta/vault-protocol.md`** — the write protocol is explicitly never delegated; the
  supersession sweep names `oa-vault-scribe` as its standing mechanism.
- **[[0022-delegate-independent-work-to-tiered-subagents|ADR-0022]]** + `decisions/README`,
  `00-INDEX` conventions line.

## Supersession sweep

Nothing was superseded — the change is additive — but the sweep was run for the renamed principle
and for statements contradicting serialized writes.

- **Fixed:** `/speckit-implement` step 6 said `[P]` tasks "can run together". Now contradicted by
  the write-serialization rule; corrected in the same task.
- **Historical, left as-is:** `specs/001-*/plan.md:55` and `specs/002-*/plan.md:53` record
  `VII. Token-Efficient Tooling (RTK) | ✅ Pass` in their Constitution Check tables. Both specs are
  complete; these are point-in-time gate records, not restatements of a live rule, and the RTK
  requirement they checked still holds inside the broadened principle. Rewriting a finished spec's
  gate record would falsify history. Flagged here so a future `/speckit-analyze` name mismatch is
  not mistaken for drift.
- **Clean:** `context/goals.md`, `architecture/overview.md`, `domain/glossary.md`,
  `Roadmap & Status` — none of them stated a delegation rule to contradict.

## Honest open questions

Carried into ADR-0022 rather than resolved here: haiku's retrieval quality on this vault is
untested; `oa-verifier` sharing sonnet with `oa-implementer` may make it a rubber stamp rather than
an adversary; and brief-writing overhead may exceed the saving on small slices. If the last one
proves true, tighten the trigger's independence condition — do not abandon the practice.

## Related

- [[0022-delegate-independent-work-to-tiered-subagents|ADR-0022]] · [[delegation]] ·
  [[0021-retrieval-discipline-by-default|ADR-0021]] · [[vault-protocol]]
