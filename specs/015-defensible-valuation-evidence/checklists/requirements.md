# Requirements Quality Checklist: Defensible valuation evidence

**Purpose**: Verify that the feature specification is testable, bounded, and safe to plan.
**Created**: 2026-08-02
**Feature**: [spec.md](../spec.md)

## Scope and terminology

- [x] CHK001 The value target is explicitly limited to active listing asks.
- [x] CHK002 Transaction price, quick-exit price, and buy ceiling are separately defined and out of scope.
- [x] CHK003 The existing legacy price core and all live behavior are explicitly preserved.
- [x] CHK004 The feature has no unresolved placeholders or ambiguous replacement claims.

## Evidence and safety

- [x] CHK005 Every outcome, including disabled, deferred, unavailable, and invalid input, has an auditable terminal state.
- [x] CHK006 Required provenance, input availability, provider response summary, and comparability decision are specified.
- [x] CHK007 Weak or relaxed comparisons fail closed and name their limitations.
- [x] CHK008 Historical explanation is explicitly source-free and reproducible.
- [x] CHK009 Source access, budget, rate-limit, secret, privacy, and fallback constraints are explicit.

## Validation and rollout

- [x] CHK010 Each user story has independently testable acceptance scenarios.
- [x] CHK011 Success criteria are measurable without inventing unobserved transaction truth.
- [x] CHK012 A representative gold-case corpus and discrepancy review are required.
- [x] CHK013 A separate operator-approved live rollout remains mandatory.

## Notes

- This checklist confirms specification completeness only; it does not approve a production scoring change.
