---
title: SPEC-018 phase 2 — accident-severity shadow recording and the rollout report
type: context-log
date: 2026-08-03
updated: 2026-08-03
---

# SPEC-018 phase 2 — accident-severity shadow recording and the rollout report

## Trigger

Phase 1 (same day) landed the graded accident classifier but wired it to nothing — it was dead
code. Phase 2 is what makes it produce evidence: compute the verdict on every evaluation, persist
it, and report on what the live clamp is suppressing. The clamp stays live; nothing observable
changes.

Sequencing rationale worth keeping: T011 requires **a full month of shadow data** before the phase-3
flip can be considered. The clock only starts when this ships, so phase 2 was picked ahead of the
other ungated candidates (SPEC-006 US6.1, SPEC-016) despite the roadmap listing SPEC-006 first.

## Where the verdict is computed, and why there

`computeValuation` in `src/modules/valuation/valuation.service.ts`, next to `assessCondition`.

That is the **only** place in the codebase where the three inputs the classifier needs coexist:
`red-flags.ts` receives `RedFlagInput` and never sees the description; `condition.ts` receives only
the description and never sees the AUTO.RIA bar. `ValuationInput` already carries all five fields and
`tables.accidentSeverity` already reaches the call site, so no plumbing was added.

`accidentSeverity` is a new field on `ValuationResult`. **Nothing downstream reads it** — the red-flag
evaluation, `priceCore`, `composeFactors`, `isOpportunity` and `reason` are byte-identical. That is
what makes SC-001 hold *by construction* rather than by careful arithmetic, and it is what
`test/integration/accident-shadow-equivalence.spec.ts` asserts: every corpus case is scored twice,
once with the lexicon absent (the pre-018 world) and once with it loaded from disk, and the whole
scoring projection is compared with `toEqual`. The lever is the `HeuristicTablesService` stub, the
same one `scoring-pipeline.spec.ts` uses.

The placement also pre-positions phase 3, which resolves `disqualifying` from the `ParameterSet` at
the same site.

## The explanation-versioning trap (found while implementing, worth remembering)

`evaluation-explanation.ts` had two latent defects that only bite when a **third** schema version
appears — which is exactly what this task added:

- `isEvaluationExplanationV2` was an `=== 2` equality check. A V3 record would have failed it and
  `/why` would have silently dropped provider evidence.
- `withProviderEvidence` hard-set `schemaVersion: 2`. Called on a freshly built V3 record (it is
  invoked from `listings.service.ts`), it would have **downgraded** it.

Both fixed: the guard is now `>= 2` ("does this record carry the `providerEvidence` field"), and
`withProviderEvidence` never lowers a version. The general lesson is that an exact-version check on a
schema designed to grow is a bug waiting for the next version, not a style preference.

No migration: the verdict rides inside the existing `jsonb` columns (`listing.lastExplanation`,
`opportunity.explanation`). Stored V1/V2 records keep rendering unchanged.

## The carried-over T002 item is closed

Phase 1 noted that `HeuristicTablesService.hashes()` had **no consumer anywhere** — liquidity and
repair-risk were in the same position. V3 now carries `heuristicTableHashes` for all three tables at
once, populated at the write site in `poll.service.ts`. The explanation is where scoring provenance
is written, so "which table version scored this listing" is answerable without a `ParameterSet`
schema change.

## The report is designed to be able to argue against the flip

`/accident_shadow [days]`, admin-gated, read-only over persisted explanations plus
`ListingDisappearance`. Zero new requests, zero budget spend.

Two aggregation rules do the real work, and both exist to stop the report overstating the case for
flipping:

- **Attribution.** A listing counts as "suppressed by the accident clamp" only when *every*
  disqualifier that fired is an accident one (`damaged`, `desc_after_accident`). A listing also
  killed by `suspicious_discount`, `salvage`, `confiscated`, `under_credit` or `desc_not_running`
  would still die after the flip, so counting it would inflate the apparent cost of the clamp.
  `severe` is excluded for the same reason — grading keeps killing it (FR-002).
- **Would-be score.** The persisted `score`/`priceCore` are already clamped to ≤ 0 by the
  disqualifier, so they cannot answer "would this have alerted". But `raw`, `confidence` and
  `penalty` are persisted **unclamped**, and `raw × confidence × penalty` is exactly the expression
  `computeValuation` evaluates *before* the clamp. With the composite factors inactive (production
  today) that reconstruction equals the would-be score; the digest sets `factorsActive` when it
  would not, so the number never quietly overstates.

Per FR-007 the rendered text states that it authorizes a *review*, not a flip, and names the outcome
that argues against flipping: if the suppressed listings reliably relisted, cut price, or sat long,
the clamp was empirically earned and **not flipping is the correct result**. Three tests assert that
wording is present.

## Verification (native Windows `npm.cmd`; the RTK wrapper is Linux/musl and does not run here)

`typecheck`, `lint`, contract Jest (46), and `nest build` all pass. Full Jest: **708 of 709 pass**.
The one failure is the same pre-existing, unrelated `single-flights concurrent calls…` timeout in
`test/unit/valuation-evidence.service.spec.ts` documented on 2026-08-03 — it still exceeds Jest's 5 s
default. Root cause is now identified and recorded for whoever picks up the SPEC-015 task: the test
hand-drives a promise resolver assuming `maybeCapture` yields exactly one microtask before calling
the provider; when it yields more, `resolveProvider` is still `undefined`, the optional-chained call
silently no-ops, and `Promise.all` never settles. It is a defect in the test, not a slow test.

Adding a constructor parameter to `QueryService` and a field to `ValuationResult` required position
fixes in three test construction sites (`query-service.spec.ts`, `poll.spec.ts`,
`why-message.spec.ts`). Note that `{} as never` positional mocks typecheck regardless of order, so a
shifted argument shows up as a runtime failure rather than a compile error.

## Not done, deliberately

Phase 3 (the flip: `ParameterSet` fields, `red-flags.ts` resolving `disqualifying` from the active
set) and phase 4 (rendering severity in `/why` and the spec-016 breakdown). Phase 3 needs T011's
month of evidence **and** operator approval, and per ADR-0010 should be considered alongside the
combined rollout so the operator faces one before/after comparison rather than two.

## Related

- [[0020-graded-accident-risk|ADR-0020]] · [[0011-evidence-gated-scoring-rollout|ADR-0011]] ·
  [[0010-defer-factor-activation-until-k|ADR-0010]]
- Prior note: `context/log/2026-08-03-graded-accident-risk.md` (phase 1)
- `specs/018-graded-accident-risk/tasks.md` — T007–T010 ticked, T011 open by design
