---
title: Assessment confidence (SPEC-006 US6.1) implemented
type: context-log
date: 2026-08-04
updated: 2026-08-04
---

# Assessment confidence — SPEC-006 US6.1, phases 1–3 (T001–T013)

Shipped the one item the roadmap listed as able to proceed now: assessment confidence is a
separate, never-multiplied evidence-coverage output. No score, threshold, ParameterSet activation,
or alert-set change, so it sits outside the [[0011-evidence-gated-scoring-rollout|ADR-0011]] gates
([[0018-assessment-confidence-and-monetary-output|ADR-0018]]).

## What landed

| Task | Result |
|---|---|
| T001 | `src/modules/valuation/valuation.types.ts` — `AssessmentConfidence`, `ConfidenceInput`, `ConfidenceReason`, `ConfidenceInputKey`, plus the `CostEstimate`/`MonetaryOutput` shapes phases 4–6 will fill |
| T002/T010 | Grew the **existing** SPEC-018 `EvaluationExplanationV3` additively with `assessmentConfidence?` and `monetary?` rather than forking a V4; V1/V2 stay readable |
| T003/T008 | Six optional `ParameterSet.params` fields; `buildSeedParams` seeds `confidenceWeights: {}` so seed and weight table cannot drift |
| T004/T005 | The non-multiplication guard — `test/unit/valuation-additivity.spec.ts` and `test/integration/assessment-confidence-equivalence.spec.ts` |
| T006/T007 | Pure `assessment-confidence.ts` + 30 unit tests |
| T009 | Wired into `computeValuation` behind `safeAssessmentConfidence`; a computation error yields an absent output and never fails the evaluation (AS-4) |
| T011/T012 | One alert line in `opportunity-message.ts`; the full signed reason list in `/why` from persisted data only, zero source calls (SC-005) |

## Decisions worth keeping

**The guard is three-configuration, not two.** Off / on / re-skewed weights. Off-vs-on catches a
plain `score × confidence`; the re-skewed leg catches the subtler case where someone multiplies a
value in and then makes the output always-present to hide the off-vs-on diff. A fourth block
asserts the corpus is not vacuous (a percent for every case, ≥50-point spread, moves under
re-skewing) — without it a corpus of identical listings would make the equalities meaningless.
Verified by temporarily mutating the return to `score * (percent/100)`: 13 of 32 tests failed.

**Weights encode a claim, not a guess.** VIN evidence (20+15) and cohort depth (20+10) dominate
because they are what most often makes an evaluation wrong — odometer fraud
([[0014-conservative-benchmark-and-mileage-guard|ADR-0014]]) and a fair value drawn from too few
comparables. Descriptive inputs are graded rather than binary so a listing missing one field does
not lose what a listing missing five loses. Reasons are emitted from the same table walk as the
weights, so a weight change cannot desync from its explanation.

**Reason copy is Ukrainian, at the source.** Both formatter agents delivered English reason text
inside Ukrainian messages. Fixed in the weight table rather than the formatters: the text is
persisted and rendered verbatim by `/why`, so the table is the only place it can be got right.
Zero persisted records existed to stay faithful to — the feature had never run. Locked by a test
asserting no run of lowercase Latin in any reason text (acronyms like VIN still pass).

**One shared label map.** The two surfaces had independently grown divergent Ukrainian names for
the same keys (`вибірка порівнянь` vs `обсяг вибірки порівнянних`) — to an operator that reads as
two different inputs. Consolidated into `src/modules/notifications/format/confidence-labels.ts`.

**Wording avoids a live collision.** The alert already carries `Впевненість:` — the price-core
sample-size multiplier, which *does* move the score. Confidence renders as `Доказова база`
("evidence base") precisely so the two are not conflated, which is the risk ADR-0018 §1 names.

## Open — needs an operator decision

`confidenceWeights` is seeded into new ParameterSets but **not backfilled into an active one**. A
deployment whose active ParameterSet predates spec 006 renders no confidence until one
`createCandidate` + `activate`. That honours T003 (absent means omitted, never a fabricated
default) and keeps T004's cleanest on/off lever, but the step is not in `tasks.md`. The alternative
— a code-side default when the params entry is absent — contradicts T003 as written and was not
taken.

Two smaller gaps left for their own phases: the `/why` renderer cannot distinguish "the guard
swallowed an error" from "no `confidenceWeights` configured" (both persist as `null`, and telling
them apart would need a ParameterSet lookup, which SC-005 forbids), so it names both causes in one
honest line; and `C_hold`'s unknown-tier range shape is left to phase 4.

## Also fixed this session

`test/unit/valuation-evidence.service.spec.ts` — the `single-flights concurrent calls…` failure
carried as pre-existing since 2026-08-03. Two defects, both in the test: it hand-drove a fixed
number of microtask ticks assuming `maybeCapture` reaches the provider after exactly one (it awaits
the freshness lookup first, so the resolver was still `undefined` and `Promise.all` never settled),
and it never pinned `now`, so its 2026-08-02 fixture expired against the real clock and the reuse
leg silently became a second provider call. Now drains until the provider call actually lands, and
pins `now` like its sibling tests. Suite is 492/492.

## Verification

Native `npm.cmd` — the bundled RTK wrapper is a Linux/musl binary and does not run on this Windows
host (CLAUDE.md §3 fallback, stated as required). `typecheck`, `lint`, unit **492/492**, contract
**46/46**, `nest build` — all pass.

Jest also scans a stale git worktree at `.claude/worktrees/eager-easley-3aaaf6`, which double-counts
suites; runs used `--testPathIgnorePatterns worktrees`. Worth deleting — it is not this task's.
