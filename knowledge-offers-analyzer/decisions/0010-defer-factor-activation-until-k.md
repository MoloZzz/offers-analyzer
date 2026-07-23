---
title: ADR-0010 — Keep spec-003 factors inactive until the survivorship correction lands
type: decision
status: Accepted
updated: 2026-07-23
---

# ADR-0010 — Keep spec-003 factors inactive until the survivorship correction lands

**Status:** Accepted (operator decision — FIX-003.1 option (b))
**Date:** 2026-07-23

## Context

Spec 003's liquidity and repair-risk factors are coded, tested, and merged, but inert in prod:
the active `ParameterSet` (version 1, seeded 2026-07-17, before the factors shipped) has
`factorBounds: null` / `upliftCap: null`, both factors gate on those bounds, and no code path
ever re-seeds or activates a new ParameterSet (verified 2026-07-23 — [[2026-07-23-session-01]]).
So `score === priceCore` in prod. FIX-003.1 asked for a decision: (a) activate now (build an
activation mechanism, seed `PHASE1_FACTOR_BOUNDS`, re-validate thresholds per S6/T050), or
(b) keep disabled explicitly.

Meanwhile SPEC-004's central hypothesis is that the **price core itself is miscalibrated** —
`fair_value` inflated 8–15% by survivorship bias — and its data collection (US4.1–4.2 + the
US4.1b market sweep) started accruing disappearance events on 2026-07-23, with the correction
factor `k` expected ~3 weeks later.

## Decision

**Option (b): the spec-003 factors stay intentionally disabled until `k` lands.** When SPEC-004
US4.4 applies `k`, the same ParameterSet change activates `PHASE1_FACTOR_BOUNDS`, and thresholds
are re-validated **once** (S6/T050) against the final score shape.

Rationale: activating bounded factor modifiers on top of a mismeasured price anchor would force
two threshold re-validations (one now, one when `k` shifts every score again), with the interim
tuning done against numbers we already believe are wrong. The backlog's standing "What NOT to
do" verdict points the same way: fix the survivorship bias first, then revisit thresholds.

## Consequences

- Prod scoring stays exactly `priceCore` for ~3 more weeks — no behavior change now, so no
  threshold risk now.
- One combined rollout (k + factor bounds + single re-validation) instead of two — less
  operator churn, one clean before/after precision comparison in `/report`.
- FIX-003.1 is closed as *decided*; the activation work moves into spec 004 **Phase C**
  (apply `k`), which now also owns building the ParameterSet activation path and S6/T050.
- Risk accepted: if SPEC-004 is falsified (`k ≥ 0.97`), factor activation was delayed ~3 weeks
  for nothing — acceptable, since the falsification result itself redirects the tuning effort.
- The "startup warning when a factor is coded but its bounds are empty" idea from FIX-003.1
  stays open (nice-to-have, listed in spec 004 tasks as deferred).

## Related

- [[backlog#FIX-003.1]] · [[0006-operator-profit-vision|ADR-0006]] ·
  [[0005-versioned-parameter-sets|ADR-0005]] · spec `004-realized-price-calibration` (Phase C)
- [[2026-07-23-session-01]] (verification) · [[2026-07-23-session-02]] (SPEC-004 implementation)
- [[decisions/README]]
