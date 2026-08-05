---
title: "Roadmap & Status"
type: roadmap
updated: 2026-08-02
summary: Canonical current delivery status, evidence gates, completed work, and next sequence.
---

# Roadmap & Status

> Canonical high-level delivery status and sequencing. Feature detail belongs in repo-root specs;
> ADRs own decisions; the historical working queue remains in context/backlog.md during migration.

## Current

The product is beyond bootstrap: it monitors configured AUTO.RIA profiles, evaluates new listings,
and supports Telegram delivery. The current production score intentionally remains the price core.
The next material product change is not another factor by itself; it is an evidence-backed,
operator-approved rollout of the survivorship correction and factor activation.

SPEC-015 implements a separate provider-evidence stream for active-market asking prices. It is
shadow-only, disabled by default, and cannot alter the current score, alerts, threshold,
ParameterSet, factors, or correction `k`. Provider credentials/traffic, migration application,
budget allocation, source-parity/gold-case audit, and a future separate approval remain explicit
operator gates.

- [ ] Complete the pre-rollout evidence gates before changing live scoring.

### Prove the next scoring rollout

| Stream | Current state | Exit evidence |
|---|---|---|
| Realized-price calibration (SPEC-004) | Disappearance capture and market-sweep foundations exist; candidate k computation, validation, and application remain. | Cohort quality, void/relist rates, stability, and confidence interval support or falsify k. |
| Explanation provenance (B23) | Required before changing live scoring. | A historical score and alert can be explained without source re-fetch. |
| Budget observability (SPEC-009) | Durable ledger and read-only budget reporting exist; real spend must still be reconciled and forecast. | Ledger reconciles to the pool and supports a credible allocation forecast. |
| Operator economics (SPEC-007) | Outcome capture foundation exists; realized-margin learning phases remain. | Sufficient closed-deal evidence for a review, not automatic deployment. |
| Provider valuation evidence (SPEC-015) | Implemented as a default-off, separate shadow-evidence path; no provider traffic, migration application, or live scoring change has been authorized. | Official-provider contract/retention approval, shadow coverage/parity, budget reconciliation, and operator-approved follow-on decision. |

Only after those gates pass may one ParameterSet rollout apply k, activate the approved first score
factors, and re-validate thresholds. Operator approval remains mandatory
([[0010-defer-factor-activation-until-k|ADR-0010]],
[[0011-evidence-gated-scoring-rollout|ADR-0011]]).

## Completed / operating

| Area | Status |
|---|---|
| Core monitoring and Telegram alerts (SPEC-001) | MVP implementation exists; operating profiles remain an operator setup concern. |
| Outcome feedback and bounded calibration (SPEC-002) | Initial outcome, threshold-calibration, and bounded weight-learning slices are implemented; later optimization remains gated. |
| Composite score foundation (SPEC-003) | Score presentation, liquidity, and repair-risk foundations exist but are intentionally inactive in production. Seller, positives, and segment-mileage factors remain later work. |
| Budget stabilization (SPEC-010) | Implemented to protect fresh-listing discovery and make cohorts reusable. |
| Valuation sanity guards (SPEC-011) | Implemented: median-first benchmark and conservative mileage treatment. |
| Assessment confidence (SPEC-006 US6.1) | Implemented 2026-08-04: a separate, never-multiplied evidence-coverage output over zero-cost fields, rendered in the alert and `/why`. The non-multiplication property is asserted at both unit and alert-set level. The remaining SPEC-006 monetary slices stay gated. |
| Executable hybrid vault (SPEC-012) | Implemented: generated L1 context, bounded retrieval, verified Offers source facts, strict CI validation, and advisory-only evidence. |
| Portable AI infrastructure kit (SPEC-013) | Implemented: clean-room, copy-and-own second-brain/bootstrap kit with safe docs-only defaults and opt-in extensions. |

- [x] Core monitoring and Telegram delivery are implemented.
- [x] Initial outcome feedback and bounded calibration slices are implemented.
- [x] Composite score foundation and its intentionally inactive first factors are implemented.
- [x] Budget stabilization is implemented.
- [x] Median-first valuation sanity guards are implemented.
- [x] Assessment confidence is implemented as a never-multiplied, ungated display output.

## Blocked / paused

- SPEC-005 lifecycle and tiered rechecks are paused until operator-profit evidence, budget
  reconciliation, and explicit approval exist.
- [ ] Score activation is blocked on the current evidence gates and operator approval.
- [ ] Lifecycle rechecks are paused behind their approved budget and operator-profit gates.

## Next

- [x] Ship assessment confidence ([[SPEC-006]] US6.1). **Implemented 2026-08-04** (T001–T013). One
  operator step remains before it is visible on an existing deployment: `confidenceWeights` is
  seeded into new ParameterSets but not backfilled, so a deployment whose active set predates spec
  006 renders no confidence until one `createCandidate` + `activate`. Deliberate — absent weights
  omit the output rather than fabricate a default.
- [ ] After the gates pass, apply one approved ParameterSet rollout for correction k, factor
  bounds, and threshold re-validation.
- [ ] Then the monetary slices of [[SPEC-006]], promoted ahead of the remaining composite factors
  by ADR-0018 because they *replace* the dimensionally wrong liquidity and repair-risk multipliers
  rather than adding more of them.
- [ ] Then choose among: remaining composite factors, cohort drift, wider coverage, additional
  sources, or ML only when their stated triggers are met.

Partly reopened the same day. ADR-0018 closed graded accident handling as data-blocked;
[[0020-graded-accident-risk|ADR-0020]] narrowed that closure. **Structured** severity (damage
location, airbag state, frame condition) is still blocked and still needs a VIN-report data
decision. But accident *presence* hard-disqualifying was never a data question, and the current
behaviour — two independent clamps, one of which fires on the phrase «після ДТП» — is wrong.
`018-graded-accident-risk` replaces it.

### Operator-facing work admitted 2026-08-03

Both are presentation/advisory and change no score, threshold, ParameterSet, or alert set, so
neither is blocked by the evidence gates above.

| Spec | What it delivers | Gate |
|---|---|---|
| `016-full-evaluation-breakdown` — **complete** | **Fully implemented 2026-08-05 (all phases).** Compact alert keeps its shape (seven lines, asserted); a 📋 **Деталі** button expands the full per-parameter breakdown, built once by `format/breakdown.ts` and shared with `/why` and `/check`. Zero source requests by construction. Phases 3–4 finished the job: `/check` renders the same section layout (dropping its own seller/odometer header, which the shared breakdown carries for no surface) and says it is the only one of the three that spends a source request; a differential test proves a record carrying `factors` / `assessmentConfidence` / `monetary` emits byte-identical section keys to one that does not | None — ungated. Its output is thin today and grows **automatically**, with no renderer change, as spec 003 activates and spec 006 lands — that property is now asserted, not assumed |
| `017-on-demand-ai-analysis` | Admin-only `/analyze_ai`: structured context to a language model, strict structured output, content-hash cache, separate budget, immutable records | Ships disabled. Provider credentials, approved terms, lawfulness of sending listing content, and an agreed monthly cap are operator gates ([[0019-advisory-only-ai-analysis|ADR-0019]]) |
| `018-graded-accident-risk` phases 1–2 | **Implemented 2026-08-03.** Severity classifier + shadow recording in `EvaluationExplanationV3` + admin-only `/accident_shadow` rollout report quantifying what the current clamp suppresses | None — shadow mode changes nothing observable, asserted bit-for-bit by `accident-shadow-equivalence.spec.ts`. The month-long shadow window (T011) is now the gate on phase 3 |

`018-graded-accident-risk` **phase 3** (the flip to graded penalties) is the exception: it changes
the alert set, so it needs a month of shadow evidence — the window opens on the first production poll
cycle after the phase-2 deploy — plus operator approval, and should be
considered alongside the ADR-0010 combined rollout so the operator faces one before/after
comparison rather than two. If the shadow report shows the suppressed listings were reliably bad
deals, the correct outcome is **not to flip** — that possibility is a designed result.

## Work-entry rule

For a non-trivial change, create or update the relevant Spec Kit package first, then update this
roadmap only at the level of priority, phase, status, blocker, or exit evidence. Do not use a
session log or a large backlog item as the canonical implementation contract.

## Legacy queue migration

context/backlog.md is retained as a valuable historical execution record and a staging area for
unpromoted ideas. It is no longer the canonical answer to “what is the project status?”:

1. Put active feature detail in a formal repo-root Spec Kit package.
2. Put durable priority, blocker, and outcome summaries here.
3. Preserve old backlog IDs and history until each item is deliberately promoted or archived; do
   not bulk-delete or silently rewrite them.

## Related

- [[vision-and-goals|Product vision and goals]]
- [[requirements|Product requirements]]
- [[invariants|Architecture invariants]]
- [[specs/README|Feature specs index]]
- [[decisions/README|Decision log]]
