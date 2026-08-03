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

## Implementation delivery

Implemented the SPEC-015 shadow-only evidence path without enabling the provider:

- Official AUTO.RIA AI adapter behind a typed `ValuationProvider` port, default-off configuration,
  startup validation, redacted fixtures, and no legacy-average fallback.
- Additive policy/evidence/budget persistence plus the supplied (but unapplied)
  `1785350000000-spec-015-valuation-evidence.ts` migration.
- A detached poll sidecar and manual `/check` path with immutable terminal states, shared source
  admission, dedicated `valuation_ai` allocation, bounded retry, and source-free `/why` plus
  admin-only `/valuation_audit`.
- Gold corpus/audit parity reporting, explicit local response-capture provenance, input-completeness
  and comparable-count rendering, currency-safe provider/legacy comparisons, and fail-closed
  comparability for missing material facts or insufficient comparables.

The hardening pass also guards the detached sidecar against overwriting a newer Listing score, price,
or explanation; binds evidence to the exact frozen evaluation; prevents zero source-ID/year
sentinels from becoming provider facts; and makes shared source-pool admission atomic.

No credential was added, no provider request was sent, no database migration was applied, and no
legacy fair value, score, rank, opportunity rule, alert, threshold, ParameterSet, factor, or `k`
changed. Provider enablement, a development migration/no-churn run, pending gold-case captures, and
operator audit review remain deployment gates.

## Validation completed

On native Windows through RTK, the following passed after the implementation and hardening pass:

- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd test -- --runInBand` — 51 suites, 309 tests
- `npm.cmd run test:contract -- --runInBand` — 3 suites, 23 tests
- `npm.cmd run build`
- `npm.cmd run vault:build`
- `npm.cmd run vault:check:strict`
- `npm.cmd run vault:test`

`git diff --check` is clean. The unrelated local `.claude/settings.local.json` remains unmodified.
