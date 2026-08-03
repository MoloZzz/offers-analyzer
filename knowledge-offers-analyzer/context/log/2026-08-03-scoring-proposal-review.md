---
title: Review — operator proposal for a risk-adjusted expected-profit score
type: context-log
date: 2026-08-03
updated: 2026-08-03
---

# Review — operator proposal for a risk-adjusted expected-profit score

## Trigger

Operator proposed replacing price-difference scoring with a risk-adjusted expected-profit model:
price/profit breakdown, mileage analysis, liquidity score, reliability knowledge base, weighted
red flags, graded accident severity, repair-cost estimate, a 0–10 flip-attractiveness score with
weights (30/20/20/10/10/10), and an assessment **Confidence Score**.

No code, spec, ParameterSet, or vault decision was changed by this review.

## Coverage check against existing decisions

| Proposal item | Status in this project |
|---|---|
| 1. Expected gross/net profit in money | [[SPEC-006]] `Z`/`ROI` — drafted, backlog position 9 |
| 2. Mileage analysis + expected mileage | `mileage.ts`, `mileage-risk.ts`, ADR-0014, spec 003 US5, CHANGE-003.3 |
| 3. Liquidity score | spec 003 US1 — coded in `factors/liquidity.ts`, inactive per ADR-0010 |
| 4. Reliability / repair-risk knowledge base | spec 003 US2 — coded in `factors/repair-risk.ts`, inactive; per-issue cost/probability is SPEC-006 `C_rec` |
| 5. Weighted red flags | `red-flags.ts` soft flags already accumulate and are learnable (spec 002 E4) |
| 6. Graded accident severity (L1/L2/L3) | **Not covered, and data-blocked** — `autoInfoBar` exposes booleans only |
| 7. Repair-cost estimate | SPEC-006 `C_rec` = Σ p(failure) × cost, with σ |
| 8. Flip attractiveness 0–10 | spec 003 US-F 0–100 total + SPEC-006 `Z`/`ROI` |
| Fixed weight vector | Conflicts with the price-dominance invariant (ADR-0006 §3) |
| **Assessment Confidence Score** | **Genuinely new** — current `confidence` is cohort-count only |

## Findings

1. The proposal independently re-derives [[0006-operator-profit-vision|ADR-0006]]. That is mild
   confirmation the composite direction is right; it is not a reason to re-specify it.
2. The one net-new idea is **assessment confidence** — confidence in the *evaluation*, distinct
   from the existing cohort-sample-size `confidence` that multiplies into the score. It must be a
   separate, non-multiplied output; multiplying it would double-count the sample-size gate and the
   `unverified_bargain` dampener.
3. Because it changes no score, threshold, ParameterSet, or alert set, a display-only assessment
   confidence is **not blocked** by the [[0011-evidence-gated-scoring-rollout|ADR-0011]] gates.
4. Items 6 and several proposed red flags (owner count, ownership duration, service records, key
   count, VIN mismatch) require data `ListingDetail` does not carry; see [[vin-real-mileage]] for
   the VIN-report access options.
5. Line-item repair estimates (parts/paint/labour to the dollar) are false precision: the system
   cannot see the damage. SPEC-006's expected-value-with-σ formulation is the correct shape.
6. Sequencing objection: stacking six estimated quantities on a price anchor suspected of an
   8–15% survivorship bias (SPEC-004) inverts the order [[0010-defer-factor-activation-until-k|ADR-0010]]
   deliberately chose.

## Recommendation (pending operator decision)

- Ship assessment confidence as a display-only field; do not multiply it into the score.
- Move [[SPEC-006]] ahead of "more factors" — it converts liquidity and repair risk from
  dimensionless multipliers into money, which is what the proposal is actually asking for.
- Leave graded accident severity closed until a VIN-report data decision exists.
- Promote to an ADR only if the operator accepts the non-multiplied confidence output.

## Related

- [[0006-operator-profit-vision|ADR-0006]] · [[0010-defer-factor-activation-until-k|ADR-0010]] ·
  [[0011-evidence-gated-scoring-rollout|ADR-0011]] · [[0014-conservative-benchmark-and-mileage-guard|ADR-0014]]
- [[profitability-methods-coverage]] · [[profitability-definition]] · [[SPEC-006]] · [[Roadmap & Status]]
