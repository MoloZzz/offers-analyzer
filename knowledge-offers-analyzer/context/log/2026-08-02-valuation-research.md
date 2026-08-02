---
title: Valuation research — false-bargain investigation
type: context-log
date: 2026-08-02
updated: 2026-08-02
---

# Valuation research — false-bargain investigation

## Trigger

The operator reported AUTO.RIA listing `38266770` (Audi A6 Allroad 2004, asking $5,000) as a
95/100 opportunity: the persisted explanation used a $6,500 base plus $325 mileage adjustment
to produce a $6,825 fair value and a 26.74% discount. The live AUTO.RIA page instead showed an
average price of $5,000 and a $4,882–$5,395 range.

## Verified diagnosis

- The current result is mechanically consistent with active ParameterSet v1, not evidence that
  the ParameterSet is ignored: `6500 × 1.05 = 6825`; `26.74 / 30 = 0.89`; and 23 samples reach
  the current count-only confidence cap.
- `resolveBenchmark` deliberately excludes mileage-banded cohorts for cache reuse, leaving a
  nationwide make+model+year±1 cohort. It does not use generation, modification, body, fuel,
  gearbox, drivetrain, region, or condition in the benchmark query.
- The listing is a 2004 C5/4B 2.7T Tiptronic Quattro in Kyiv with claimed 305k km. The generic
  annual-mileage rule expects 330k km, so its 25k difference triggers the full 5% old-car uplift.
  A checked VIN is treated as sufficient evidence although the page exposes seller-declared
  mileage, not structured odometer-history evidence.
- The listing description discloses corrosion and several mechanical faults. Current condition
  rules do not recognize those phrases, and repair-risk factors remain deliberately inactive.

## Research result

AUTO.RIA marks the classic median endpoint used by the adapter as unsupported / soon to close.
Its paid AI valuation endpoint supports a listing-id (`omniId`) lookup, richer vehicle/condition
features, and returns both an estimate and comparable listings. It should first be evaluated in
shadow mode; an active-listing or provider market estimate is not a confirmed transaction price.

## No scoring change made

This task made no API calls using the production key and did not modify live scoring,
ParameterSets, thresholds, or rollout gates. Before implementation, create a valuation spec and
decision that separates active retail ask, likely transaction, quick-exit price, and a conservative
buy ceiling. Preserve ADR-0011's evidence and operator-approval gates.
