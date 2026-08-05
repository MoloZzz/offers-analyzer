---
title: Delegation to subagents — when, which model, and what to hand over
type: convention
updated: 2026-08-05
summary: Independent, fully-specified work is delegated to a named subagent with a pinned model tier so the orchestrator's context stays wide; reads fan out in parallel, writes are serialized, and the vault write protocol never delegates.
---

# Delegation to subagents

> This note **owns** the delegation rule. `CLAUDE.md` §4 carries only the trigger; the detail
> lives here. Rationale: [[0022-delegate-independent-work-to-tiered-subagents|ADR-0022]].

## Why

Two separate wins, and they are worth naming separately because they justify different choices:

1. **Context economy.** A subagent's reads — source files, test output, note bodies — never
   enter the orchestrator's window. Only its report does. This is why a *research* subagent pays
   for itself even when the orchestrator could have done the work faster itself.
2. **Clean context per slice.** An implementer that has not read the previous six slices cannot
   be confused by them. Independent tasks get a context matched to their actual scope.

Cost is a third, smaller win: a pinned cheaper model on mechanical work. It is a consequence of
the tiering, not the reason for it. **Do not delegate to save money on work whose failure would
be expensive to find** — see *Never delegate* below.

## The four agents

Defined in `.claude/agents/`. The model tier is pinned in each definition's frontmatter, so
which model runs a class of work is **declarative, not a per-task judgment call**.

| Agent | Model | Writes? | Use for |
|---|---|---|---|
| `oa-researcher` | haiku | no | One bounded lookup: where is X, what does note Y say, spec-kit Phase 0 research |
| `oa-vault-scribe` | haiku | no | The §1 supersession sweep — find every note repeating a fact that just changed |
| `oa-implementer` | sonnet | yes | One fully-specified slice: named files, decided contract, known acceptance test |
| `oa-verifier` | sonnet | no | Independent adversarial check of a finished slice, plus the quality gates |

The orchestrator (opus) keeps spec authorship, ADRs, prioritization, scoring/threshold judgment,
and the vault write protocol. Sonnet's track record on well-specified slices in this project is
the empirical basis for that tier — spec-002 E1a–E4b, B12, B16, B21a, B22 all shipped delegated.

## Delegate when — all four hold

1. The work is **independent**: it does not need facts produced by another in-flight slice.
2. The **contract is decided**: files to touch, exported signatures or entity fields, and the
   acceptance test are known *before* the brief is written. If deciding the contract is the hard
   part, that part is not delegable — do it, then delegate the build.
3. The **raw material is much larger than the answer** (research), or the slice is
   **self-contained enough to hold in a fresh context** (implementation).
4. The result is **cheaply verifiable** — a test, a gate, or a claim `oa-verifier` can check.

A `[P]` marker in `tasks.md` already asserts (1); it is a delegation candidate by construction.

## Never delegate

- **Spec authorship, ADRs, prioritization.** These *are* the orchestrator's judgment.
- **Scoring weights, thresholds, `ParameterSet` activation, alert-set changes.** Evidence-gated
  under [[0011-evidence-gated-scoring-rollout|ADR-0011]]; a subagent cannot hold the evidence
  context that gates them.
- **The vault write protocol.** Subagents *report* durable facts in their `VAULT:` line; the
  orchestrator promotes them. Delegated vault edits produce plausible notes that quietly diverge
  from what was actually built — the exact failure the vault exists to prevent.
- **Delicate cross-cutting files** — `poll.service.ts` is the standing example; it was kept
  in-house during spec-002 for this reason and that judgment held.
- **Anything you cannot write a precise brief for.** If the brief would say "figure out how to
  do X", you are delegating the thinking, not the typing. Do the thinking first.

## Parallelism: reads fan out, writes serialize

- **Read-only agents** (`oa-researcher`, `oa-verifier`, `oa-vault-scribe`) may run **several at
  once**. No conflict is possible and the context saving multiplies.
- **Write-capable agents** (`oa-implementer`) run **one at a time** on the shared working tree.
  Concurrent writers on one tree corrupt each other, and timestamp-named append-only migrations
  are a live collision risk when two slices touch the schema.
- Worktree isolation for genuinely parallel writers was considered and **not adopted**: it buys
  wall-clock speed at the cost of a merge step, and the context win — the actual goal — comes
  from isolating the reads, which serialization does not impede.

## The brief — what to hand over

Pass **references and a target question**, never pasted note bodies (this is the §1 rule applied
to delegation). A brief that inlines the material it should be citing has already spent the
context the delegation was supposed to save.

A complete brief names:

- **Goal** — one sentence, the observable outcome.
- **Task id** — the `tasks.md` `T0NN` or backlog item, so the report is traceable.
- **Files** — the exact allowed write set. The agent must stop rather than exceed it.
- **Contract** — signatures, entity fields, migration intent that other slices will depend on.
- **Context refs** — `note#section`, `spec.md` path, ADR number. Not their contents.
- **Acceptance** — the test that must exist and pass.
- **Known hazards** — anything already learned that would otherwise be rediscovered expensively.

## What the orchestrator does with the result

1. **Read `SURPRISES` / `FINDINGS` first.** They are the part that changes plans.
2. **Route `VAULT:` lines into the §1 write protocol** — promote each durable fact to its owning
   note. This is the step that gets skipped; a task with an unpromoted `VAULT:` line is not done.
3. **Run `oa-verifier` on any slice that touched behavior** before accepting it. An implementer
   reporting its own success is not independent evidence.
4. **Record delegation in the context log** — which agent, which slice, which model — so the
   practice stays auditable and its cost measurable.

## Related

- [[0022-delegate-independent-work-to-tiered-subagents|ADR-0022]] (the decision) ·
  [[0021-retrieval-discipline-by-default|ADR-0021]] (mechanism over exhortation; the `/status` path)
- [[coding-standards]] (what an implementer must follow) · [[vault-protocol]] (L1–L4, write
  protocol, supersession sweep) · [[environment-setup]] (`tools/rtk` invocation)
- Agent definitions: `.claude/agents/oa-{researcher,implementer,verifier,vault-scribe}.md`
