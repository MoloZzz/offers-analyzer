---
title: Feature specs index (SDD)
type: moc
updated: 2026-08-02
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
| `../../specs/005-listing-lifecycle-rechecks/spec.md` | Re-check active listings by score proximity and seller behavior so meaningful price cuts are re-scored and alerted | Paused (formalized 2026-07-28; implementation waits for demonstrated operator profit, then SPEC-009 evidence and operator approval) |
| `../../specs/007-deal-outcomes/spec.md` | Capture real post-deal economics (bought/declined/sold + prices + costs + realized DOM) as a stateful `deal_outcomes` record, and compute realized margin (`sell - buy - costs`) - the ground truth 👍/👎 only approximates | Draft (US7.1-US7.2 implemented 2026-07-23; US7.3 (re-target auto-tuning, CHANGE-002.1) + US7.4 (`Z` calibration) pending) |

| `../../specs/010-budget-stabilization/spec.md` | Reduce legacy rechecks and unshareable cohort requests while preserving production discovery | Implemented; observe ledger before any further budget expansion |

| `../../specs/011-valuation-sanity-guards/spec.md` | Prefer median AUTO.RIA benchmarks and prevent unverified or old claimed mileage from inflating fair value | Implemented 2026-07-29; no additional API calls |
| `../../specs/012-executable-vault/spec.md` | Preserve the curated second brain while adding generated context, bounded retrieval, source mapping, and phased vault enforcement ([[0015-hybrid-executable-vault|ADR-0015]]) | Implemented 2026-08-02; strict CI baseline is clean, source pins start narrowly, and Claude hooks remain optional |
| `../../specs/013-portable-ai-infra/spec.md` | Extract reusable second-brain, product-loop, and context-control mechanisms into a versioned bootstrap kit ([[0016-portable-ai-infra-kit|ADR-0016]]) | Implemented 2026-08-02, then **migrated out** 2026-08-03 — the kit ships from <https://github.com/MoloZzz/ai-support-system>. Spec retained as history; no `ai-infra/` code remains here and no Offers instrument depends on it |
| `../../specs/015-defensible-valuation-evidence/spec.md` | Capture first-party AUTO.RIA provider evidence for an explicitly labelled active-market asking-price estimate, with immutable provenance, conservative review states, and source-free /why | Implemented as a shadow-only, disabled-by-default evidence path; provider traffic/audit rollout and every scoring change remain pending ([[0017-shadow-valuation-evidence|ADR-0017]]) |

## Backlog-level specs (pre-Spec-Kit)

Not yet run through `/speckit-specify` — captured directly in `context/backlog.md` (2026-07-22) as
an addendum to ADR-0006/spec 003 and spec 002. Promote to a formal repo-root `specs/<id>/spec.md`
spec before implementation per SDD (§2 of `CLAUDE.md`).

| Backlog item | Summary | Priority |
|---|---|---|
| [[SPEC-006]] | Monetary output `Z`/`ROI` alongside the 0–100 score | P2 |
| [[SPEC-008]] | Cohort market drift correction | P2 |
| [[SPEC-009]] | Budget observability and rollout guardrails for the monthly pool | P0 |
| ADR-0009 | Monthly rate-limit pool + priority queue (funds SPEC-005) | — (Accepted) |

`SPEC-009` is formalized at `../../specs/009-budget-observability/`: it is implemented with a
durable allowed/denied budget ledger and read-only `/budget` report. The rollout gate becomes
evidence-ready only after the current month's ledger reconciles with the pool and its forecast
fits the allocation; it does not auto-enable SPEC-005 or profiles.

`SPEC-014` is implemented at `../../specs/014-telegram-monitoring-control/`: it adds durable,
admin-only Telegram controls to disable/re-enable the AUTO.RIA daily request limit while retaining
the monthly pool cap.

## Constitution

Project principles are ratified in `../.specify/memory/constitution.md` (v1.2.0, 2026-08-02) —
the non-negotiable rules every spec must satisfy. Amendments require an ADR + version bump.

## How this connects

- Author specs with the SDD workflow — see [[environment-setup]].
- When a spec is implemented, reflect the resulting design in [[overview]] and any new terms in [[glossary]].

## Related

- [[00-INDEX]]
- [[coding-standards]]
