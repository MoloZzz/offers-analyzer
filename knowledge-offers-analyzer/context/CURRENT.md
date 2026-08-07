---
title: Current task handoff
type: context
updated: 2026-08-07
---

# Current task handoff

> Short-lived session handoff. Replace the active-work section when work changes; do not use this
> file as a second roadmap.

## Active work

**SPEC-017 phase 4 — content-hash cache implemented 2026-08-07 (T026–T029).** `/analyze_ai` now
looks up `ai_analyses` on `(listingId, inputFactHash, promptVersion, modelId)` **before** budget
admission *and before the kill switch* — a hit makes no provider request, charges nothing, and
renders the stored answer marked as cached with its **original** capture time. Simultaneous taps on
one listing are single-flighted in process, so two admins produce one provider request. A changed
price, description, or source fact moves the hash and misses; a `promptVersion` or `modelId` change
misses too. Failed attempts are never cached, and **a hit writes no new row** — which leaves phase
5's `/ai_audit` cache-hit rate needing an invocation counter (flagged in `tasks.md` and the log).
Decisions: `context/log/2026-08-07-ai-analysis-cache.md`.

Verification: `typecheck`, `lint`, unit Jest **652/652** (74 suites), contract Jest **108/108**,
`nest build` — all pass; T008 re-run as the phase exit condition.

**SPEC-017 on-demand AI analysis — MVP implemented 2026-08-06 (phases 1–3, T001–T025).**
Admin-only `/analyze_ai <link>`: a new `src/modules/analysis/` module with a pure context builder
(seller text quarantined inside a **hash-derived** delimiter it cannot close), strict range-checked
validation that discards a bad payload whole, a versioned `AnalysisPolicy`, an `AnalysisProvider`
port with an **Anthropic** adapter (forced tool call, one `undici` POST, no new dependency), an
immutable insert-only `AiAnalysis` record, and a dedicated `ai_analysis` allocation admitted under
its **own source key** so it can never decrement the AUTO.RIA pool. Every terminal path — refusal,
provider failure, invalid output, success — writes exactly one row.

**It ships disabled** (`AI_ANALYSIS_ENABLED=false`, zero allocation) and the additive migration
`1785400000000-spec-017-ai-analysis.ts` was **not applied**. T037's four operator gates are
untouched: provider credentials, approved terms, lawfulness of sending listing content, an agreed
monthly cap. Phase 4 landed the next day (see the active-work section above); **phase 5**
(`/ai_audit`, inline button, contradiction display) remains open.

One vault contradiction was found and **fixed in code, not in the note**: the advisory score is
0–10 per `domain/glossary.md`, not 0–100 — a second 0–100 number beside the Total Deal Score would
read as a competing verdict, which is the anchoring ADR-0019 §8 forbids. Decisions and what was
deliberately not done: `context/log/2026-08-06-on-demand-ai-analysis.md`.

Verification (native Windows `npm.cmd`): `typecheck`, `lint`, unit Jest **637/637** (73 suites),
contract Jest **108/108**, `nest build` — all pass.

## Previously (still current)

**Drivetrain-banded cohort tiers — implemented 2026-08-06 ([[0024-drivetrain-banded-cohort-tiers|ADR-0024]]).**
The cohort ladder gained two tiers above the year±1 cohort: exact year + gearbox + fuel, then year±1
+ gearbox + fuel. They are **proxies** — `/average_price` has no generation or modification
parameter, and the endpoint that does (`POST /auto/ai-avarage-price/`) is paid and shadow-only under
ADR-0017 §5, so promoting it is queued as a separate decision on [[Roadmap & Status]]. Supporting
changes: `SourceNoDataError` turns HTTP 400 "Not Enough Data" into a cacheable zero-sample result;
`cohortKey` appends the band so bandless keys stay byte-identical for the SPEC-004 join; two new
coverage weights in `assessment-confidence.ts`. **Unlike ADR-0023 this can move a benchmark either
way** and therefore changes the alert set — worth watching the tier strings in `/why` for the first
production cycles. Decisions and what was deliberately *not* done:
`context/log/2026-08-06-drivetrain-banded-cohorts.md`.

Verification (native Windows `npm.cmd`): `typecheck`, `lint`, Jest **549/549** (65 suites),
`nest build` — all pass.

**One-sided mileage adjustment — implemented 2026-08-06 ([[0023-one-sided-mileage-adjustment|ADR-0023]]).**
The analytic mileage correction may now only *lower* fair value. The ADR-0014 exception that let a
below-expectation odometer add up to 5% when AUTO.RIA reported VIN evidence is removed, along with
the `allowPositiveAdjustment` / `maxPositiveAdjPct` options that carried it — `mileageAdjustmentPct`
returns `[−maxAdjPct, 0]` by construction, so no call site can reintroduce an uplift. Rationale: the
AUTO.RIA VIN signals attest that a report exists, not that the displayed reading is real, so the
uplift ran on a seller-typed number and turned understated odometers into high-scoring alerts.
Scores can only move down or stay equal; no ParameterSet change, so this sits outside the ADR-0011
gates. Decisions and what was deliberately *not* done:
`context/log/2026-08-06-one-sided-mileage.md`.

Verification (native Windows `npm.cmd`): `typecheck`, `lint`, Jest 1896/1897 — the single failure is
a pre-existing timeout flake in the stale `.claude/worktrees/recursing-chandrasekhar-4293e8` copy,
not in the real tree.

**SPEC-016 — fully implemented 2026-08-05 (T001–T022, all four user stories).**

**Phases 3–4 (T015–T019)** closed the spec. `/check` now renders the shared section layout instead
of its own compact header, so all three breakdown surfaces — the 📋 **Деталі** button, `/why` and
`/check` — go through the one builder; `formatAssessment` is a single expression and
`opportunity-message.ts` lost 35 net lines. Two operator-visible consequences, both deliberate:
`/check` **no longer prints seller type or the odometer reading** (the shared breakdown carries
neither for any surface, because a persisted `EvaluationExplanation` never captured them — re-adding
them for `/check` alone would recreate the per-surface divergence this spec exists to remove; both
remain on the pushed alert), and `/check` now **states that it is the only one of the three that
spends a source request**. A latent fabrication was fixed on the way: the `/check` call site was
passing defaulted cohort context (`sampleSize: 0`, `mileageAware: true`), harmless while `/check`
read two lines out of the builder but an invented cohort under the full layout. Phase 4 is a
test-only differential proof that a record carrying `factors` / `assessmentConfidence` / `monetary`
emits byte-identical section keys and titles to one that does not — which is what lets the ADR-0010
rollout and SPEC-006's monetary slices land without touching a formatter. Decisions:
`context/log/2026-08-05-breakdown-surface-adoption.md`.

Verification (native Windows `npm.cmd`): `typecheck`, `lint`, Jest **537/537** (65 suites),
`nest build` — all pass. `oa-verifier` returned PASS WITH FINDINGS; both findings were duplicate
tests, resolved by giving each property one owner (that is why the count is 537, not 539).

**Phases 1–2 — implemented 2026-08-05 (T001–T014).** One pure breakdown builder
(`src/modules/notifications/format/breakdown.ts`) over the persisted `EvaluationExplanation`, with
`formatWhy`, `formatStoredWhy` and `/check` refactored onto it, plus the 📋 **Деталі** inline button
that replies with the full per-parameter breakdown from storage. The pushed alert body is unchanged
at seven lines; the reply spends **zero** source requests and charges nothing to the budget —
`details-callback.ts` has no imports at all, so the dependency is unreachable rather than merely
unused. Presentation-only, so it sits outside the ADR-0011 gates. Decisions and the one deliberate
`/check` copy change: `context/log/2026-08-05-full-evaluation-breakdown.md`.

Verification (native Windows `npm.cmd`; RTK's wrapper is Linux/musl and does not run here):
`typecheck`, `lint`, Jest **526/526** (63 suites), `nest build` — all pass.

Phases 3–4 of the same spec closed later the same day — see the active-work section above.

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

With phases 1–4 in, the remaining **ungated** engineering work on SPEC-017 is **phase 5** —
`/ai_audit`, the inline-button shortcut, and the contradiction display (T030–T033). Start T031 by
deciding where a cache hit is counted: it deliberately writes no `ai_analyses` row, so the specified
cache-hit rate has no source yet. None of it can be exercised end-to-end until an operator enables
the provider, but it is all pure code.

Everything else — the `k` rollout, SPEC-006's monetary slices, SPEC-018 phase 3 — waits on evidence
gates or the month-long accident shadow window (which opened on the first production poll after the
2026-08-03 phase-2 deploy), not on code. **The next material product step is still operator/evidence
work, not engineering.**

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
