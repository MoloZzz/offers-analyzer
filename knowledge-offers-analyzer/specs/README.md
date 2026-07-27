---
title: Feature specs index (SDD)
type: moc
updated: 2026-07-28
---

# Feature specs index

> Bridge between the vault and Spec Kit. The repo-root `specs/` directory holds the feature specs; `.specify/` holds the Spec Kit tooling, memory, templates, and workflows used to produce them. Link each spec here with a one-line summary so the knowledge base stays the single map.

## Specs

| Spec | Summary | Status |
|------|---------|--------|
| `../../specs/001-profitable-listing-alerts/spec.md` | Monitor configured AUTO.RIA niches -> flag below-fair-value, low-risk listings -> alert via Telegram | Draft (v1 MVP implemented; mileage/condition/report follow-ups pending) |
| `../../specs/002-auto-calibration-learning/spec.md` | Capture outcomes -> auto-calibrate the alert threshold -> learn scoring weights; transparent, bounded, human-in-the-loop | Draft (E1-E4 implemented; `disappeared` signal + per-profile precision auto-apply deferred) |
| `../../specs/003-composite-deal-score/spec.md` | Rank by probability of operator profit ([[0006-operator-profit-vision|ADR-0006]]): composite Total Deal Score - price core (dominant) x liquidity x repair-risk x negotiation x seller x positives; 0-100 explanation; segment mileage norms | Draft (core score implemented but intentionally inactive in prod per [[0010-defer-factor-activation-until-k|ADR-0010]]; factor activation deferred until SPEC-004's `k` lands, then one combined ParameterSet change + single threshold re-validation, owned by spec 004 Phase C; negotiation/seller/positives/mileage pending) |
| `../../specs/004-realized-price-calibration/spec.md` | Survivorship correction to `fair_value`: measure candidate `k` from listing disappearances, validate its quality, then apply `X = RIA_average x k` | Draft (US4.1-US4.2 + US4.1b implemented 2026-07-23; US4.3 + US4.3a readiness gate + US4.4 pending) |
| `../../specs/007-deal-outcomes/spec.md` | Capture real post-deal economics (bought/declined/sold + prices + costs + realized DOM) as a stateful `deal_outcomes` record, and compute realized margin (`sell - buy - costs`) - the ground truth 👍/👎 only approximates | Draft (US7.1-US7.2 implemented 2026-07-23; US7.3 (re-target auto-tuning, CHANGE-002.1) + US7.4 (`Z` calibration) pending) |

## Backlog-level specs (pre-Spec-Kit)

Not yet run through `/speckit-specify` — captured directly in `context/backlog.md` (2026-07-22) as
an addendum to ADR-0006/spec 003 and spec 002. Promote to a formal repo-root `specs/<id>/spec.md`
spec before implementation per SDD (§2 of `CLAUDE.md`).

| Backlog item | Summary | Priority |
|---|---|---|
| [[SPEC-005]] | Listing lifecycle + tiered re-check (catches price cuts after ingest) | P1 |
| [[SPEC-006]] | Monetary output `Z`/`ROI` alongside the 0–100 score | P2 |
| [[SPEC-008]] | Cohort market drift correction | P2 |
| [[SPEC-009]] | Budget observability and rollout guardrails for the monthly pool | P0 |
| ADR-0009 | Monthly rate-limit pool + priority queue (funds SPEC-005) | — (Accepted) |

## Constitution

Project principles are ratified in `../.specify/memory/constitution.md` (v1.1.0, 2026-07-18) —
the non-negotiable rules every spec must satisfy. Amendments require an ADR + version bump.

## How this connects

- Author specs with the SDD workflow — see [[environment-setup]].
- When a spec is implemented, reflect the resulting design in [[overview]] and any new terms in [[glossary]].

## Related

- [[00-INDEX]]
- [[coding-standards]]
