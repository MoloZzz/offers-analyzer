---
title: SPEC-016 phases 3–4 — /check adopts the shared breakdown, forward-compat proved
type: context-log
date: 2026-08-05
updated: 2026-08-05
---

# SPEC-016 phases 3–4 (T015–T019)

Closed `016-full-evaluation-breakdown`. Phases 1–2 (same day, see
`2026-08-05-full-evaluation-breakdown.md`) built the shared builder and the 📋 **Деталі** button;
these two phases finish the job the spec existed for — making the builder the *only* way any surface
renders an evaluation — and prove the property that makes it worth having.

Presentation-only, like everything else in this spec: no score, threshold, `ParameterSet`, factor,
or alert-set change, so it stays outside the [[0011-evidence-gated-scoring-rollout|ADR-0011]] gates.

## What changed

| File | Change |
|---|---|
| `format/opportunity-message.ts` | `formatAssessment` (`/check`) is now **one expression**: `renderBreakdownSections(buildLiveBreakdown(...))` plus a source-cost note. Signature `(detail, result, fairValue, currency, ctx?)` → `(detail, result, ctx)`. Private `breakdownLine` helper deleted |
| `telegram/telegram-bot.update.ts` | `onCheck` passes the real cohort context off `Assessment` |
| `format/breakdown.ts` | Doc comment only — `findLine` lost its last production caller |
| `test/unit/breakdown-surface-parity.spec.ts` | New (T015), 5 tests — SC-004 |
| `test/unit/breakdown-forward-compat.spec.ts` | New (T018/T019), 6 tests — SC-006 + ADR-0019 §8 |

## Decisions

**`/check` loses seller type and the odometer reading.** They were in its old compact header. The
shared breakdown carries neither for *any* surface, because a persisted `EvaluationExplanation`
never captured them — `explanation.listing` is `{externalId, make, model, year, url, askingAmount,
currency}`. Three options existed, and the choice matters more than it looks:

1. Add them to the builder as real parameters. Rejected: every historical record would then render
   two permanent `unavailable` lines for a parameter that was never *part of* the evaluation. That
   is noise masquerading as rigour.
2. Add them to `/check` only, on top of the sections. Rejected: that is precisely the per-surface
   divergence this spec was written to eliminate, reintroduced in the task that was supposed to
   finish eliminating it.
3. **Chosen:** drop them from `/check`. The breakdown surfaces render the evaluation; the *alert*
   renders the car, and it still shows both.

Small operator-visible loss, taken deliberately so SC-004 is literally true rather than true with
exceptions.

**The `/check` call site was fabricating cohort context.** `formatAssessment` used to default
`sampleSize: 0`, `benchmarkBase: fairValue`, `mileageAware: true` when its optional `ctx` was
omitted — and the `/check` call site omitted it. That was harmless while `/check` read only two
lines out of the builder, but under the full section layout it would have rendered a cohort of
"вибірка 0" and a mileage correction of "не застосовувалася — когорта вже враховує пробіг" for
listings where neither is true: an invented value, exactly what SC-005 forbids. `Assessment` already
carried the real `sampleSize` / `benchmarkBase` / `mileageAware`; the call site now passes them. The
optional-with-defaults parameter is gone, so the fabrication cannot come back by omission.

**What did *not* get deleted in T017.** `risksLabel`, `sellerLabel`, `mileageLabel`, `scoreEmoji`,
`confidenceLine`, `signed`, `fmt` all remain in `opportunity-message.ts`. They are the *alert's*
formatting, still reached from `formatOpportunity` / `formatPriceDrop`, and the alert body is frozen
by SC-001. The task's "delete duplicated logic left behind" means logic the refactor orphaned, not
the alert's own compact vocabulary — which is a genuinely different shape from a breakdown, not a
drifted copy of one.

## The forward-compatibility proof is differential

T018's value is not "the sections render". It is that a bare V3 (`factors: []`,
`assessmentConfidence: null`, `monetary: null`) and a populated V3 differing *only* in those three
fields emit **byte-identical section keys and identical section titles in identical order**. The
populated record adds no section and removes none — which is the actual content of "new parameters
appear with no renderer change" (SC-006), and what lets the ADR-0010 rollout and SPEC-006's monetary
slices land without touching a formatter.

Both fixtures are V3 with explicit `null`s, so they exercise the carried-but-not-measured branch
rather than the pre-schema `undefined` one. Getting that backwards would have proved the wrong
property. The bare fixture is what makes this a proof rather than a demonstration.

T019's AI-absence check (ADR-0019 §8) is a **closed allow-list** over section keys plus a length
assertion, not a `not.toContain` on rendered text — so a future section added to `assemble()` fails
the test instead of slipping past a string match.

## Delegation (CLAUDE.md §4)

| Slice | Agent | Model | Outcome |
|---|---|---|---|
| T015 surface-parity test | `oa-implementer` | sonnet | DONE, 5 tests. One lint error (`no-unnecessary-type-assertion`) fixed by the orchestrator |
| T018/T019 forward-compat test | `oa-implementer` | sonnet | DONE, 6 tests |
| Phase 3–4 verification | `oa-verifier` | sonnet | **PASS WITH FINDINGS** — two redundancy findings, both resolved (below) |
| Supersession sweep | `oa-vault-scribe` | haiku | read-only, "phases 3–4 open" → implemented |

T016/T017 were kept in the main context: their hard part was deciding the seller/mileage trade-off
and the signature change, which is contract authorship, not slice execution.

### Verifier findings and how they were resolved

Both implementers reported skipping duplicate assertions; the verifier found that two had survived
anyway. Neither was a behavioural defect — both tests were real and would fail if their property
were violated — but each duplicated a Phase-1 test, which means two tests failing for one cause.
Resolved by giving each property exactly one owner:

| Finding | Resolution |
|---|---|
| `breakdown-surface-parity.spec.ts` asserted section order, duplicating `breakdown.spec.ts` | Deleted. The label-parity test subsumes it — `Object.keys` preserves insertion order, so comparing key arrays checks order as well as membership |
| `breakdown-forward-compat.spec.ts` monetary subordination overlapped `breakdown.spec.ts` | Kept (T019 mandates it, and it is strictly stronger: three-way, populated fixture) and **deleted the weaker two-way version** from `breakdown.spec.ts` |

Worth recording because the pattern will recur: a subagent asked not to duplicate an existing test
will still say it skipped duplicates while leaving one in. The check has to be the verifier's, not
the implementer's self-report.

## Verification

Native Windows `npm.cmd` — **fallback stated** per CLAUDE.md §3: the bundled `tools/rtk` wrapper is
a Linux/musl binary and does not execute on this runtime.

- `typecheck` — clean
- `lint` — clean (0 warnings, `--max-warnings 0`)
- Jest — **537/537, 65 suites** (`--testPathIgnorePatterns worktrees`). 539 before the two duplicate
  tests found by the verifier were removed; the suite count is unchanged because both files remain
- `nest build` — clean

## Known follow-ups

- The V1/V3 explanation fixture plus the `confidence` / `monetary` consts are now duplicated across
  three spec files (`breakdown.spec.ts`, `breakdown-surface-parity.spec.ts`,
  `breakdown-forward-compat.spec.ts`). A shared `test/fixtures/` module would be the right home;
  deliberately not done inside this task's write set.
- The stale git worktree at `.claude/worktrees/eager-easley-3aaaf6` still double-counts Jest suites
  and belongs to no active task. Every run here needed `--testPathIgnorePatterns worktrees`.

## Related

`specs/016-full-evaluation-breakdown/` · [[Roadmap & Status]] · [[explainability-gaps]] ·
[[0019-advisory-only-ai-analysis|ADR-0019]] · `2026-08-05-full-evaluation-breakdown.md`
