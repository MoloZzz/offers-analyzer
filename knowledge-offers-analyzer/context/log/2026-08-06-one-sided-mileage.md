---
title: One-sided mileage adjustment
type: context
updated: 2026-08-06
---

# 2026-08-06 — mileage may only lower fair value

## Ask

Operator: the computed market price is not tracking the real market. Specifically the mileage
parameter should **only decrease** it, because a large share of sellers understate the odometer and
the system reads those listings as good offers.

## What was wrong

`MileageAdjuster.fairValue` still granted an uplift for a below-expectation odometer when AUTO.RIA
exposed `hasVinReport || risk.vinChecked`, capped at 5% for cars aged 15+
([[0014-conservative-benchmark-and-mileage-guard|ADR-0014]]). Those AUTO.RIA signals mean "a VIN
report exists", not "the displayed reading was verified" — so the uplift ran on a seller-typed
number. That is the exact failure the operator is seeing: understated km → inflated fair value →
large discount → high score → alert on a bad car.

The soft flags `suspicious_low_mileage` / `unverified_bargain` were catching some of this
downstream, but only after the fair value had already been inflated.

## Change

`src/modules/valuation/mileage.ts` — the correction is one-sided **inside the pure function**, not
at the call site:

- `mileageAdjustmentPct` returns `0` when mileage is at or below `age × annualK`, otherwise a
  negative value clamped to `−maxAdjPct`. Range is `[−maxAdjPct, 0]` by construction.
- Deleted `allowPositiveAdjustment` and `maxPositiveAdjPct` from `MileageAdjustOptions`, and with
  them the VIN-evidence exception and the 15-year 5% cap.
- `MileageAdjuster.fairValue` no longer reads `hasVinReport` / `risk.vinChecked` at all — the
  dependency is gone, not merely unused.
- Early-return on `excessK <= 0` rather than a `Math.min`, which also avoids returning `−0`.

Above-expectation mileage behaves exactly as before. `mileageAware` cohorts still bypass the
correction (and in the live path they never match — `resolveBenchmark` filters banded cohorts out
for cache reuse, SPEC-010).

Decision recorded as [[0023-one-sided-mileage-adjustment|ADR-0023]].

## Not done, deliberately

- **No penalty for implausibly low mileage.** The ask was "only decrease", i.e. one-sided; actively
  marking fair value *down* for a suspiciously low reading is a different change. That signal
  already exists as the `suspicious_low_mileage` soft flag on the score side.
- **No ParameterSet change.** No `k`, no factor bounds — this is a deterministic guard tightening,
  outside the [[0011-evidence-gated-scoring-rollout|ADR-0011]] gates, same class as ADR-0014.
- **`breakdown.ts` still renders a signed `Поправка на пробіг`.** Explanations persisted before
  today can carry a positive adjustment, so the `+` branch is live history, not dead code.

## Tests

- `test/unit/mileage.spec.ts` — the two uplift tests are inverted into "never raises", plus an
  absurd-odometer case, plus MileageAdjuster cases proving VIN evidence buys nothing and that
  `mileageAware` still passes through.
- `test/integration/scoring-pipeline.spec.ts` — the below-market BMW's fair value is now the bare
  benchmark 16000 (was 16480 with the +3% uplift); discount 25% (was 27.18%). Still an opportunity.

Verification (native Windows `npm.cmd`; RTK's wrapper is Linux/musl and does not run here):
`typecheck`, `lint`, Jest **1896/1897** — the one failure is
`test/unit/valuation-evidence.service.spec.ts` inside the stale worktree
`.claude/worktrees/recursing-chandrasekhar-4293e8` (commit 84e066a, unrelated branch), a 5s-timeout
flake in a single-flight test; the same spec passes in the real tree.

## Follow-up

Recovering value for genuinely low-mileage cars needs a measured reading, not a claimed one —
[[vin-real-mileage]] (B21) remains the path. Segment mileage norms (CHANGE-003.3, cohort median
instead of `age × 15k`) are still open and would improve the *downward* side of this same curve.
