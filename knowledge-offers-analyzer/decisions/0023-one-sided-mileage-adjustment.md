---
title: ADR-0023 - One-sided mileage adjustment
type: decision
status: Accepted
updated: 2026-08-06
---

# ADR-0023 - One-sided mileage adjustment

**Status:** Accepted
**Date:** 2026-08-06

## Context

[[0014-conservative-benchmark-and-mileage-guard|ADR-0014]] left one door open: a claimed low
odometer could still raise fair value when AUTO.RIA exposed VIN-report or VIN-check evidence,
capped at 5% once a car reached 15 years. Operator experience since then shows the exception is
not worth its cost. Understating the odometer is the cheapest and most common way a seller dresses
up a bad car, and the AUTO.RIA VIN signals do not attest the reading — `vinChecked` and
`hasVinReport` say a report exists, not that the number on the page matches it. Every uplift the
exception granted therefore ran on a seller-typed number, and it ran hardest exactly where the
scam is most profitable: an inflated fair value turns into a large discount, a high deal score,
and a pushed alert for a listing the operator would reject on sight.

The bad direction is also asymmetric in cost. Under-valuing a genuinely low-mileage car costs the
operator one missed alert among many; over-valuing a rolled-back one costs a wasted trip and
erodes trust in every score the bot sends.

## Decision

The analytic mileage correction is **one-sided**: it may only lower fair value, never raise it.

- `mileageAdjustmentPct` returns a value in `[−maxAdjPct, 0]`. At or below the age-expected
  mileage the result is exactly `0`.
- The VIN-evidence exception and the 15-year 5% positive cap from ADR-0014 are **removed**, along
  with the `allowPositiveAdjustment` and `maxPositiveAdjPct` options that expressed them.
- The constraint lives in the pure function, not in the caller, so no present or future call site
  can produce an uplift from a claimed odometer.
- Above-expectation mileage still lowers fair value exactly as before, clamped at `maxAdjPct`
  (default 20%).

This **narrows** ADR-0014; the median-first fair-value base and everything else in that decision
stand unchanged.

## Consequences

Fair value is now weakly monotone in the claimed odometer in the safe direction only. Fake-bargain
alerts driven by an understated reading disappear at the source, rather than being caught
downstream by the `suspicious_low_mileage` / `unverified_bargain` soft flags — those remain, now as
a second line of defence rather than the only one.

Scores can only move down or stay equal, so the change cannot flood the operator with alerts; it
can only remove some. It is not an [[0011-evidence-gated-scoring-rollout|ADR-0011]] activation —
no `k`, no factor bounds, no ParameterSet change — it is a tightening of a deterministic guard, in
the same class as ADR-0014 itself.

Genuinely low-mileage cars are now valued conservatively **without exception**, including
well-documented ones. Recovering that upside requires a real measured mileage, not a claimed one:
see [[vin-real-mileage]]. Persisted explanations written before this change may still carry a
positive `mileageAdjustment`, so the breakdown formatter keeps rendering a signed value.

## Related

- [[0014-conservative-benchmark-and-mileage-guard|ADR-0014]] (narrowed by this decision)
- [[0011-evidence-gated-scoring-rollout|ADR-0011]] · [[0020-graded-accident-risk|ADR-0020]]
- [[vin-real-mileage]] · [[profitability-definition]]
