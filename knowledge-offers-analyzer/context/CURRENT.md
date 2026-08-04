---
title: Current task handoff
type: context
updated: 2026-08-04
---

# Current task handoff

> Short-lived session handoff. Replace the active-work section when work changes; do not use this
> file as a second roadmap.

## Active work

**SPEC-006 US6.1, assessment confidence — implemented 2026-08-04 (T001–T013).** A separate,
never-multiplied evidence-coverage output over already-fetched fields, rendered as one
`Доказова база` line in the alert and as the full signed reason list in `/why`. It changes no
score, threshold, ParameterSet activation, or alert set — asserted at unit level across three
weight configurations (`test/unit/valuation-additivity.spec.ts`) and at alert-set level
(`test/integration/assessment-confidence-equivalence.spec.ts`) — so it sits outside the ADR-0011
gates. Details and the decisions behind the weight table:
`context/log/2026-08-04-assessment-confidence.md`.

**One operator step before it is visible on an existing deployment:** `confidenceWeights` is seeded
into new ParameterSets but deliberately not backfilled, so a deployment whose active set predates
spec 006 renders no confidence line until one `createCandidate` + `activate`. Absent weights omit
the output rather than fabricate a default (T003).

The pre-existing `single-flights concurrent calls…` failure in
`test/unit/valuation-evidence.service.spec.ts` is **fixed** — two defects in the test itself
(a fixed-tick microtask drain, and an unpinned `now` whose fixture had since expired against the
real clock). The suite is 492/492.

## Previously (still current)

SPEC-015, Defensible valuation evidence, is implemented at
`specs/015-defensible-valuation-evidence/`. It adds an official AUTO.RIA AI provider-evidence path
for the target `active_listing_ask`, but only as disabled-by-default shadow mode. The code includes
typed provider/source facts, immutable redacted evidence/policy records, dedicated `valuation_ai`
budget allocation, source-free `/why`, and admin-only `/valuation_audit`.

The existing scoring, lifecycle, and budget rollout gates remain unchanged. The implementation did
not apply its additive migration, ship credentials, make source traffic, or change fair value,
score, alert, threshold, ParameterSet, factor, or survivorship correction `k`.

## Also open (2026-08-03)

[[0018-assessment-confidence-and-monetary-output|ADR-0018]] accepted the operator's scoring-proposal
review: assessment confidence becomes a separate, **never-multiplied** output built from zero-cost
fields, [[SPEC-006]] is promoted ahead of the remaining spec-003 factors and formalized at
`specs/006-monetary-output-z-roi/`, and graded accident severity was closed as data-blocked — a
closure **narrowed the same day by [[0020-graded-accident-risk|ADR-0020]]** (see below). Only
SPEC-006 US6.1 is ungated; every monetary slice still waits on SPEC-004 `k`, SPEC-007, SPEC-008 and
the [[0011-evidence-gated-scoring-rollout|ADR-0011]] gates. No code was changed by that task.

Later the same day, [[0019-advisory-only-ai-analysis|ADR-0019]] admitted advisory AI services as a
new external-system class (constitution v1.2.0 → v1.3.0) and two specs were formalized:
`016-full-evaluation-breakdown` (compact alert + **Деталі** button over one shared renderer) and
`017-on-demand-ai-analysis` (admin-only `/analyze_ai`, cached, separately budgeted, advisory-only
permanently). Both are presentation/advisory and change no score or alert set. Spec 017 ships
disabled; provider credentials, approved terms, lawfulness of sending listing content, and a monthly
cap are operator gates. No code was changed by either task.

## Implemented 2026-08-03 — SPEC-018 phases 1 and 2 (T001–T010)

**Phase 1** put the accident-severity classifier in code: `src/modules/valuation/accident-severity.ts`
(pure), `config/heuristics/accident-severity.json` (versioned lexicon, loaded and content-hashed by
`HeuristicTablesService`), a 55-case labelled uk+ru corpus at `test/fixtures/accident-corpus.ts`,
and 14 tests including the SC-002/SC-003 anti-gaming properties.

**Phase 2 (T007–T010)** wired it in **shadow mode**. The verdict is computed in `computeValuation` —
the only site where the description, the AUTO.RIA bar flags and the VIN state coexist — and persisted
in a new `EvaluationExplanationV3` alongside `heuristicTableHashes` (which also closes phase 1's
carried-over T002 item: `HeuristicTablesService.hashes()` finally has a consumer, for all three
tables). Admin-only `/accident_shadow [days]` reports, read-only and with zero new requests, what the
live clamp is suppressing and what happened to those listings afterwards.

**Nothing downstream reads the verdict.** `red-flags.ts`, `condition.ts`, the score and the alert set
are untouched, so both passes change nothing observable and sit outside the
[[0011-evidence-gated-scoring-rollout|ADR-0011]] gates. `test/integration/accident-shadow-equivalence.spec.ts`
asserts that bit-for-bit (SC-001).

Two latent defects in `evaluation-explanation.ts` were fixed as part of this: the V2 guard was an
exact `=== 2` check (a V3 record would have lost provider evidence in `/why`) and
`withProviderEvidence` hard-set `schemaVersion: 2` (it would have downgraded a V3 record).

**T011 is open by design** — the shadow window must run a full month before phase 3 (the
operator-approved flip) is considered, and per [[0010-defer-factor-activation-until-k|ADR-0010]] the
flip should be presented alongside the combined rollout. See
`context/log/2026-08-03-accident-shadow-recording.md` for the implementation decisions.

## Next pickup

With US6.1 shipped, the remaining **ungated** engineering work is `016-full-evaluation-breakdown`
and `017-on-demand-ai-analysis` (the latter ships disabled behind operator gates). Everything else
— the `k` rollout, SPEC-006's monetary slices, SPEC-018 phase 3 — waits on evidence gates or the
month-long accident shadow window, not on code.

If the pickup is instead SPEC-015, read this handoff and
`specs/015-defensible-valuation-evidence/quickstart.md`.
Confirm official AUTO.RIA AI permission, allowed storage/attribution, effective pricing/allocation,
and sanitized fixture parity before enabling any provider request. On an operator-approved
development database, apply and regenerate the additive migration to verify no schema churn. Then
collect the pending gold-case strata and review `/valuation_audit`. Do not promote active-listing
evidence to a resale model or change the live score without a separate approved decision.

## Verification / blockers

- Completed on 2026-08-02 (native Windows `npm.cmd` through RTK): `typecheck`, `lint`, full Jest
  (309 tests), contract Jest (23 tests), Nest build, `vault:build`, `vault:check:strict`, and
  `vault:test` all pass.
- 2026-08-04 (native Windows `npm.cmd`; the RTK wrapper is Linux/musl and does not run here):
  `typecheck`, `lint`, unit Jest **492/492**, contract Jest **46/46**, and Nest build all pass.
  The `single-flights concurrent calls…` failure carried since 2026-08-03 is **resolved** — it was
  two defects in the test, not in the code: a fixed-tick microtask drain that assumed
  `maybeCapture` reaches the provider after exactly one tick (it awaits the freshness lookup
  first, leaving `resolveProvider` undefined so `Promise.all` never settled), and an unpinned
  `now` that let its 2026-08-02 fixture expire against the real clock.
- Jest also scans a stale git worktree at `.claude/worktrees/eager-easley-3aaaf6`, which
  double-counts suites; runs used `--testPathIgnorePatterns worktrees`. The worktree should be
  removed — it belongs to no active task.
- The remaining blockers are external/operator gates only: approved provider credentials/terms and
  allocation, a development migration apply/re-generation check, pending gold-case captures, and
  the `/valuation_audit` review. Leave `AUTO_RIA_AI_ENABLED=false` until those gates are complete.
- 2026-08-03: `ai-infra/` and its `ai-infra:test` script/CI step were removed; the kit now ships
  from <https://github.com/MoloZzz/ai-support-system> ([[0016-portable-ai-infra-kit|ADR-0016]]).
  This project's instruments are unchanged — `tools/vault/` is a superset of the extracted core.
- Claude hooks are deliberately optional; Codex and other runtimes use the explicit brief/handoff
  protocol. The optional PostgreSQL evidence extension is documentation only and did not query a
  database in this task.
- Confirm code and deployment state before acting on a roadmap item. Record concrete work in a new
  dated context/log/ file and promote durable facts before closing the task.
