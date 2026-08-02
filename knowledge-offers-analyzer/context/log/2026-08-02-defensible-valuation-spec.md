---
title: Session log — defensible valuation evidence specification
type: context
updated: 2026-08-02
---

# Session log — defensible valuation evidence specification

## Outcome

Created the formal Spec Kit package for SPEC-015, Defensible valuation evidence:

- Feature specification, quality checklist, implementation plan, research, data model, contracts,
  quickstart, and a dependency-ordered task list live under specs/015-defensible-valuation-evidence/.
- The feature is deliberately shadow-only and disabled by default. It introduces an approved
  AUTO.RIA AI provider estimate labelled active_listing_ask; it does not call that number a resale
  or transaction price.
- Proposed ADR-0017 records the boundary. It does not change any accepted production decision.

## Basis

The Audi A6 Allroad investigation showed that the current legacy path mechanically used a broad
cohort median plus mileage uplift to reach $6,825, while the contemporaneous AUTO.RIA market display
was around $5,000. The plan preserves legacy behavior while collecting richer provider evidence and
making every missing/relaxed dimension, source failure, and provider-to-legacy difference auditable.

Key external references are recorded in the feature research:

- AUTO.RIA official AI valuation API
- AUTO.RIA deprecated legacy median/average API documentation
- AUTO.RIA public price calculator
- Ukraine comparable-valuation methodology
- MIA turnover data limitation (no prices)

## No runtime change

No production TypeScript, migrations, configuration values, source traffic, ParameterSet, score,
alert threshold, factor, k, or notification behavior changed in this task. The next implementation
step is T001 in SPEC-015 and requires provider access/retention confirmation before enabling any
paid request.

## Validation planned

The package requires contract fixtures, zero-change legacy regression tests, shared-budget
accounting, source-free /why rendering, a gold-case parity audit, and explicit operator review before
any future activation proposal.

