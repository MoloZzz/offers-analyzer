---
title: ADR-0021 — Enforce retrieval discipline with defaults and triggers, not exhortation
type: decision
status: Accepted
updated: 2026-08-04
summary: Planning questions are answered from maintained artifacts on a fixed path (`/status`) with a named escalation trigger; a proposed 350-word "Information Acquisition Policy" was rejected as redundant with rules that already existed and were violated.
---

# ADR-0021 — Enforce retrieval discipline with defaults and triggers, not exhortation

**Status:** Accepted
**Date:** 2026-08-04

## Context

A `what is the next task to implement` query consumed ~135k tokens. The operator's hypothesis was
that the retrieval infrastructure had failed — that no authoritative project state existed, or
that retrieval returned whole source documents instead of distilled state.

Measurement contradicted both. `npm run vault:brief -- "Roadmap & Status"` returns 166 lines /
9.8KB (~2.4k tokens) of genuinely distilled state, including the `Next` section that answers the
question. `vault:find "next task"` returns 3 lines and resolves correctly. The retrieval layer
works as designed. Meanwhile `src/**/*.ts` totals ~493KB (~123k tokens) — close enough to the
observed cost to identify broad source exploration as the likely bulk of it, and `_gen/code-map.txt`
(17.8KB) already exists as its maintained, 25x cheaper substitute.

So the artifacts were fine and the rules were already written — **twice**.
`_meta/vault-protocol.md` §L1–L4 opens "Use the smallest authoritative layer that answers the
question" and states "L4 is a full Markdown or source read only when editing or verifying
implementation evidence." `CLAUDE.md` §1 step 4 states "do **not** default to broad codebase
grepping." Both were in force. Both were violated.

That reframes the problem: this was a **compliance failure, not a specification gap**. A third,
longer restatement of an already-stated rule addresses the wrong layer.

A 350-word "Information Acquisition Policy" block was proposed for `CLAUDE.md` — a preferred-source
ladder plus instructions to self-assess "Information ROI" before each retrieval, and to evaluate
after each step whether enough had been collected. It was rejected for four reasons:

1. **Redundant.** Its core sentence already exists verbatim in `_meta/vault-protocol.md:14`.
2. **Unconditionally expensive.** `CLAUDE.md` is injected into every session; +350 words is ~38%
   growth in the always-on instruction budget, paid every time to address an intermittent failure.
   Longer instruction files also degrade per-instruction adherence.
3. **Self-referential.** "Will this action materially increase the quality of my answer?" is
   evaluated by the same estimator whose miscalibration caused the over-reading. An agent that
   could correctly predict a read would be useless would not perform it. And any read can be
   rationalized as high-ROI after the fact — the rule is unfalsifiable.
4. **One-sided objective.** "Minimize information acquisition" scores a zero-tool-call answer as
   optimal. An earlier session answered this very question with no tool calls at all and produced
   confident, wrong speculation about file sizes and caching. That is the failure at the other end,
   and the proposed policy rewards it.

A separate, verified defect was found in the same investigation: **`rtk` is not on `PATH` in
Cowork**, so `CLAUDE.md` §3's own fallback instruction ("prefix commands with `rtk` yourself") is
"command not found" in exactly the runtime it names — silently degrading to raw, unfiltered output.
The binary runs correctly when invoked as `tools/rtk`.

## Decision

Enforce retrieval discipline through **mechanism and named triggers**, not through additional
exhortation.

1. **`/status` skill** (`.claude/skills/status/SKILL.md`) is the fixed path for status, roadmap,
   prioritization, and "what's next" questions: `vault:brief` → (if needed) `vault:show` +
   `CURRENT.md` → (if needed) `find`/`show` → spec/ADR detail, stopping at the first step that
   answers. It states hard rules against reading `src/` or grepping the codebase for planning
   questions, and points at `_gen/code-map.txt` as the maintained substitute.
2. **A trigger-conditional rule in `CLAUDE.md` §1** (~60 words, not 350). It is conditioned on the
   *question class* — status/roadmap/prioritization/backlog — which is checkable when the question
   is read, before any tool fires. This is strictly sharper than the existing action-conditional
   phrasing ("don't default to grepping"), which only applies after the agent has already decided
   to explore.
3. **Escalation requires a stated reason.** Exactly two are valid: the user asked for verification
   against the implementation, or a specific contradiction shows an artifact is stale. The reason
   must be stated *before* the first source read. Declaring the escalation out loud is checkable;
   silent self-assessment is not.
4. **`tools/rtk`, never bare `rtk`**, wherever hooks do not run. Corrected in `CLAUDE.md` §3 and
   `operations/environment-setup.md`.

Maintained planning artifacts (`Roadmap & Status`, `context/CURRENT.md`, `_gen/code-map.txt`,
`specs/README.md`) are **authoritative** for planning questions. Staleness in one is a defect to
fix in-task under the §1 write protocol — not a licence to abandon the vault and re-derive state
from source.

## Consequences

**Easier.** The recurring, highest-frequency query class has one deterministic route with a known
cost (~2.5–3k tokens instead of ~135k). Escalation past it leaves an auditable trace, so
over-reading becomes visible in the transcript rather than inferred from a token bill afterwards.
The Cowork RTK path works instead of silently failing.

**Harder.** `/status` is another artifact to maintain; if the roadmap goes stale it will now be
confidently wrong rather than expensively right, which raises the stakes on the §1 write protocol.
That trade is accepted deliberately — a planning artifact nobody trusts has no value, so drift must
be fixed rather than routed around.

**Not adopted.** The general "Information ROI" framing is retained as *design* guidance for how
this infrastructure is built — cheap authoritative layers, deterministic paths, mechanical
enforcement — and explicitly **not** as a runtime instruction telling the agent to introspect on
expected value before each call. Do not re-propose it as prose in `CLAUDE.md`; that alternative was
considered and rejected here.

**Open.** Effectiveness is unmeasured. The honest test is an A/B: run a planning question with and
without `/status` across several sessions and compare token counts. Measured behavior should
override the reasoning in this ADR if the two disagree.

## Related

- [[decisions/README]] · [[0001-adopt-sdd-vault-rtk|ADR-0001]] (the RTK/vault/SDD baseline this
  tightens) · [[0015-hybrid-executable-vault|ADR-0015]] (bounded retrieval this operationalizes) ·
  [[0003-decoupled-context-zone|ADR-0003]] (why `CURRENT.md` is read directly, outside search)
- [[environment-setup]] (Cowork `tools/rtk` invocation) · [[vault-protocol]] (L1–L4 layers)
- Skill: `.claude/skills/status/SKILL.md`
- Discovery note: `context/log/2026-08-04-retrieval-discipline.md`
