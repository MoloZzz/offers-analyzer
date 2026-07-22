---
title: Feature specs index (SDD)
type: moc
updated: 2026-07-22
---

# Feature specs index

> Bridge between the vault and Spec Kit. Each feature specified via `/speckit-specify` lives under `.specify/` (and its feature branch/dir); link it here with a one-line summary so the knowledge base stays the single map.

## Specs

_TODO: none yet. First entry appears after the first `/speckit-specify` run._

| Spec | Summary | Status |
|------|---------|--------|
| `../../specs/001-profitable-listing-alerts/spec.md` | Monitor configured AUTO.RIA niches → flag below-fair-value, low-risk listings → alert via Telegram | Implemented (v1 MVP + mileage/condition/report follow-ups) |
| `../../specs/002-auto-calibration-learning/spec.md` | Capture outcomes → auto-calibrate the alert threshold → learn scoring weights; transparent, bounded, human-in-the-loop | Implemented (E1–E4; `disappeared` signal + per-profile precision deferred) |
| `../../specs/003-composite-deal-score/spec.md` | Rank by probability of operator profit ([[0006-operator-profit-vision\|ADR-0006]]): composite Total Deal Score — price core (dominant) × liquidity × repair-risk × negotiation × seller × positives; 0–100 explanation; segment mileage norms | **Phase F + US1 + US2 implemented** (liquidity + repair-risk factors live, gated by ParameterSet bounds; negotiation/seller/positives/mileage pending) |

## Backlog-level specs (pre-Spec-Kit)

Not yet run through `/speckit-specify` — captured directly in `context/backlog.md` (2026-07-22) as
an addendum to ADR-0006/spec 003 and spec 002. Promote to a formal `.specify/` spec before
implementation per SDD (§2 of `CLAUDE.md`).

| Backlog item | Summary | Priority |
|---|---|---|
| SPEC-004 | Survivorship correction to `fair_value` via an empirically measured `k` | P0 |
| SPEC-005 | Listing lifecycle + tiered re-check (catches price cuts after ingest) | P1 |
| SPEC-006 | Monetary output `Z`/`ROI` alongside the 0–100 score | P2 |
| SPEC-007 | Post-deal outcome labels (realized margin), replacing 👍/👎 as the auto-tuning target | P0 |
| SPEC-008 | Cohort market drift correction | P2 |
| ADR-0009 | Monthly rate-limit pool + priority queue (funds SPEC-005) | — (Accepted) |

## Constitution

Project principles are ratified in `../.specify/memory/constitution.md` (v1.0.0, 2026-07-12) —
the non-negotiable rules every spec must satisfy. Amendments require an ADR + version bump.

## How this connects

- Author specs with the SDD workflow — see [[environment-setup]].
- When a spec is implemented, reflect the resulting design in [[overview]] and any new terms in [[glossary]].

## Related

- [[00-INDEX]]
- [[coding-standards]]
