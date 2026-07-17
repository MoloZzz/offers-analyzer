---
title: Feature specs index (SDD)
type: moc
updated: 2026-07-12
---

# Feature specs index

> Bridge between the vault and Spec Kit. Each feature specified via `/speckit-specify` lives under `.specify/` (and its feature branch/dir); link it here with a one-line summary so the knowledge base stays the single map.

## Specs

_TODO: none yet. First entry appears after the first `/speckit-specify` run._

| Spec | Summary | Status |
|------|---------|--------|
| `../../specs/001-profitable-listing-alerts/spec.md` | Monitor configured AUTO.RIA niches → flag below-fair-value, low-risk listings → alert via Telegram | Implemented (v1 MVP + mileage/condition/report follow-ups) |
| `../../specs/002-auto-calibration-learning/spec.md` | Capture outcomes → auto-calibrate the alert threshold → learn scoring weights; transparent, bounded, human-in-the-loop | Draft (planned) |

## Constitution

Project principles are ratified in `../.specify/memory/constitution.md` (v1.0.0, 2026-07-12) —
the non-negotiable rules every spec must satisfy. Amendments require an ADR + version bump.

## How this connects

- Author specs with the SDD workflow — see [[environment-setup]].
- When a spec is implemented, reflect the resulting design in [[overview]] and any new terms in [[glossary]].

## Related

- [[00-INDEX]]
- [[coding-standards]]
