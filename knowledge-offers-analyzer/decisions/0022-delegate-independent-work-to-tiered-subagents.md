---
title: ADR-0022 — Delegate independent work to named subagents with pinned model tiers
type: decision
status: Accepted
updated: 2026-08-05
summary: Independent, already-specified work is dispatched to four named agents in `.claude/agents/` whose model tier is pinned in frontmatter (haiku for retrieval, sonnet for build and verify); reads fan out in parallel, writes serialize on the shared tree, and the vault write protocol is never delegated.
---

# ADR-0022 — Delegate independent work to named subagents with pinned model tiers

**Status:** Accepted
**Date:** 2026-08-05

## Context

Delegation was already this project's normal way of working, and it worked. Spec-002 shipped
almost entirely through it — E1a, E1b, E2a, E2b, E2d, E3a, E3b-2, E3b-3b, E4a, E4b — as did B12,
B16, B21a, and B22, each recorded in `context/log/2026-07-17-session-01.md` as
*"delegated → Sonnet"*. The judgment calls in those logs were sound: `poll.service.ts` was kept
in-house as *"delicate"*, and the split for E3b-3 was drawn between the delicate part and the pure
apply/service part.

None of it was written down. A grep of `_meta/`, `conventions/`, `decisions/`, and
`.specify/memory/constitution.md` for *delegat* / *subagent* returned **nothing**. The practice
lived entirely in the operator's head and in prose scattered through session logs. Three costs
followed:

1. **It varied by session.** Whether a slice was delegated, and to which model, was re-derived
   each time from nothing.
2. **The rules leaked.** The same log entry records that the orchestrator ran raw `npx tsc` /
   `npx jest` while *"subagents did use `./tools/rtk`"* — the delegated work followed §3 more
   reliably than the delegating context did, because the subagents were given explicit briefs and
   the orchestrator was operating on habit.
3. **New runtimes started cold.** Nothing in `CLAUDE.md`, `AGENTS.md`, or the constitution told a
   fresh session that delegation was the expected shape of implementation work.

[[0021-retrieval-discipline-by-default|ADR-0021]] established the neighbouring failure mode from
the retrieval side: a single planning query cost ~135k tokens, and its fix was a fixed path plus a
named trigger rather than more exhortation. Delegation is the same problem from the writing side —
an orchestrator that reads implementation detail for six consecutive slices carries all six
contexts into the seventh. The remedy is the same in kind: the reads that produce an answer should
not have to enter the context that consumes it.

There is a real cost on the other side, and it constrains the decision. Writing a precise brief is
work; a vague brief produces confidently wrong code that is more expensive to find than the work
would have been to do inline. A subagent's report is also a lossy view — the orchestrator never
sees the code, so a plausible-sounding `DONE` can conceal a defect. Delegation therefore has to be
conditioned on the contract already being decided, and paired with independent verification.

## Decision

Codify the existing practice as **mechanism** — named agents with pinned models — rather than as
guidance to delegate more.

1. **Four agents in `.claude/agents/`, model pinned in frontmatter** so the tier is declarative
   instead of a per-task judgment call: `oa-researcher` (haiku, read-only, one bounded lookup),
   `oa-vault-scribe` (haiku, read-only, the §1 supersession sweep), `oa-implementer` (sonnet, one
   fully-specified slice), `oa-verifier` (sonnet, read-only, adversarial check + quality gates).
   Each carries the binding rules it must not lose — `tools/rtk` never bare `rtk`, append-only
   migrations, the coding standards — and a **compact return contract**, because an agent that
   returns a wall of text has spent the context its use was meant to save.

2. **A trigger-conditional rule in `CLAUDE.md` §4.** The trigger is checkable before any tool
   fires: the work is independent of in-flight slices, its contract is already decided, and the
   result is cheaply verifiable. A `[P]` task in `tasks.md` satisfies it by construction, which is
   why `[P]` is now also the delegation marker in `/speckit-tasks`.

3. **`conventions/delegation.md` owns the detail** — tiers, brief format, exclusions, what the
   orchestrator does with a returned report. `CLAUDE.md` carries the trigger and the roster only.

4. **Wired into the SDD path**, so it fires where the decision is actually made rather than being
   remembered: `/speckit-plan` Phase 0 dispatches parallel `oa-researcher` agents;
   `/speckit-tasks` requires `[P]` tasks to be briefable as written; `/speckit-implement` delegates
   `[P]` slices, runs `oa-verifier` on behavior changes, and promotes returned `VAULT:` lines.

5. **Reads fan out, writes serialize.** Read-only agents run several at once. Write-capable agents
   run one at a time on the shared tree: concurrent writers corrupt each other, and timestamp-named
   append-only migrations are a live collision risk.

6. **Never delegated:** spec authorship, ADRs, prioritization, evidence-gated scoring/threshold/
   `ParameterSet`/alert-set changes ([[0011-evidence-gated-scoring-rollout|ADR-0011]]), delicate
   cross-cutting files, and the §1 vault write protocol. Subagents *report* durable facts in a
   `VAULT:` line; the orchestrator promotes them. An unpromoted `VAULT:` line means the task is not
   done — added to the `CLAUDE.md` definition of done as item 6.

## Consequences

**Easier.** Model choice stops being re-litigated per task. A fresh session in any runtime inherits
the practice instead of rediscovering it. Implementation slices get a context sized to their scope,
and the orchestrator's window survives a long spec. Because `[P]` now doubles as the delegation
marker, `/speckit-tasks` is pushed toward writing tasks that are specific enough to hand over —
which is a quality gain independent of whether the task is actually delegated.

**Harder.** Every delegated slice now needs a written brief, and the brief is real work that used
to be skipped by just doing the task. The orchestrator no longer reads the code it ships, which is
a genuine loss of oversight — `oa-verifier` is the compensating control, and it is only as good as
its independence. Four agent definitions join the set of files that must not go stale relative to
`CLAUDE.md`.

**Not adopted.**

- **Worktree isolation for parallel writers.** `.claude/worktrees/` exists and would allow true
  parallel implementation, but it buys wall-clock speed at the cost of a merge step and migration
  collisions. The objective here is context width, not speed, and serialization does not impede it.
  Revisit only if wall-clock time becomes the binding constraint.
- **One tier for everything.** Simpler, but pays sonnet rates for greps and supersession sweeps
  whose output is a list of file paths.
- **A `/delegate` skill.** The brief format is four lines of structure that already live in
  `conventions/delegation.md` and in each agent's own prompt; a fixed-path skill is warranted when
  the *route* is the hard part (as in `/status`), and here it is not.
- **`CLAUDE.md` §4 is ~150 words, not the ~60 of ADR-0021's rule.** That is a deliberate departure:
  a delegation trigger needs the roster and the parallelism rule to be actionable, and both are
  facts an agent cannot infer. The detail that *can* be looked up was pushed to the convention note.

**Open.** Unmeasured, exactly as in ADR-0021. Three specific uncertainties: haiku's retrieval
quality on this vault is untested and a wrong `oa-researcher` answer is cheaper to produce than to
catch; `oa-verifier` sharing a model tier with `oa-implementer` may make it a rubber stamp rather
than an adversary; and the brief-writing overhead may exceed the saving on small slices, in which
case the trigger's independence condition should be tightened rather than the practice abandoned.
The honest test is comparing orchestrator context growth across a delegated and a non-delegated
spec. Measured behavior should override the reasoning here if the two disagree.

## Related

- [[decisions/README]] · [[0021-retrieval-discipline-by-default|ADR-0021]] (mechanism over
  exhortation; the retrieval-side twin of this decision) ·
  [[0011-evidence-gated-scoring-rollout|ADR-0011]] (why scoring changes are never delegated) ·
  [[0001-adopt-sdd-vault-rtk|ADR-0001]] (the SDD/vault/RTK baseline the agents inherit)
- [[delegation]] (the convention note that owns the rule) · [[coding-standards]] · [[vault-protocol]]
- Agent definitions: `.claude/agents/oa-{researcher,implementer,verifier,vault-scribe}.md`
- Skills wired: `.claude/skills/speckit-{plan,tasks,implement}/SKILL.md`
- Prior practice, undocumented: `context/log/2026-07-17-session-01.md`,
  `context/log/2026-07-23-session-02.md`
