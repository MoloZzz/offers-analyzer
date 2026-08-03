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
| Executable hybrid vault (SPEC-012) | Implemented: generated L1 context, bounded retrieval, verified Offers source facts, strict CI validation, and advisory-only evidence. |
| Portable AI infrastructure kit (SPEC-013) | Implemented: clean-room, copy-and-own second-brain/bootstrap kit with safe docs-only defaults and opt-in extensions. |

- [x] Core monitoring and Telegram delivery are implemented.
- [x] Initial outcome feedback and bounded calibration slices are implemented.
- [x] Composite score foundation and its intentionally inactive first factors are implemented.
- [x] Budget stabilization is implemented.
- [x] Median-first valuation sanity guards are implemented.

## Blocked / paused

- SPEC-005 lifecycle and tiered rechecks are paused until operator-profit evidence, budget
  reconciliation, and explicit approval exist.
- [ ] Score activation is blocked on the current evidence gates and operator approval.
- [ ] Lifecycle rechecks are paused behind their approved budget and operator-profit gates.

## Next

- [ ] Ship assessment confidence ([[SPEC-006]] US6.1). It is display and ordering only, uses
  already-fetched fields, and changes no score, threshold, ParameterSet, or alert set — so it is
  **outside** the evidence gates and is the one item that can proceed now
  ([[0018-assessment-confidence-and-monetary-output|ADR-0018]]).
- [ ] After the gates pass, apply one approved ParameterSet rollout for correction k, factor
  bounds, and threshold re-validation.
- [ ] Then the monetary slices of [[SPEC-006]], promoted ahead of the remaining composite factors
  by ADR-0018 because they *replace* the dimensionally wrong liquidity and repair-risk multipliers
  rather than adding more of them.
- [ ] Then choose among: remaining composite factors, cohort drift, wider coverage, additional
  sources, or ML only when their stated triggers are met.

Closed by ADR-0018: graded accident severity (level 1/2/3) is data-blocked — the AUTO.RIA risk bar
is boolean only. Reopening requires a separate decision establishing VIN-report data access.

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
