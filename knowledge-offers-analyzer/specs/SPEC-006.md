---
title: SPEC-006 - Monetary output Z and ROI
type: spec
status: Draft
updated: 2026-08-03
---

# SPEC-006 - Monetary output Z and ROI

Curated pointer to the formal Spec Kit package at `../../specs/006-monetary-output-z-roi/`.

## Summary

- Show a projected dollar profit `Z` and ROI beside the score without replacing the score's
  gating and ranking role.
- Model holding, repair, negotiation, and transaction costs in money rather than only as score
  multipliers.
- Also carries the **assessment confidence** output — a separate, never-multiplied measure of how
  well-evidenced an evaluation is, computed from zero-cost fields
  ([[0018-assessment-confidence-and-monetary-output|ADR-0018]]).
- Status: formalized 2026-08-03 and promoted ahead of the remaining spec-003 factors by ADR-0018.
  Only the assessment-confidence slice (US6.1) is shippable now; every monetary slice stays behind
  its dependency and the [[0011-evidence-gated-scoring-rollout|ADR-0011]] gates.

## Why it was promoted

Liquidity and repair risk are genuinely *monetary* quantities currently expressed as dimensionless
multipliers. A ±10% liquidity multiplier on $2,000 of expected profit spans ±$200, but the real
holding-cost gap between a 25-day and a 120-day tier is ~$650 on a $10k car and ~$1,950 on a $30k
car — and does not scale with price. This spec **replaces** those multipliers rather than adding
more on top of them.

## Dependencies

- `SPEC-004` supplies the survivorship-corrected price anchor `k`.
- `SPEC-007` supplies closed-deal feedback for calibration.
- [[SPEC-008]] supplies cohort market drift when it becomes available.
- Spec 003 US1/US2 supply the liquidity tier (`DOM_expected`) and repair-risk patterns that
  `C_hold` and `C_rec` consume.

## Related

- [[specs/README]]
- [[Roadmap & Status]]
- [[0018-assessment-confidence-and-monetary-output|ADR-0018]]
