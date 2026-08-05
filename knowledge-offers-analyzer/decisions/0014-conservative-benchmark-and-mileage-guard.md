---
title: ADR-0014 - Conservative benchmark and claimed-mileage guard
type: decision
status: Accepted
updated: 2026-07-29
---

# ADR-0014 - Conservative benchmark and claimed-mileage guard

**Status:** Accepted
**Date:** 2026-07-29

## Context

An Opel Astra 2004 at 168k km and $3,100 was scored 10/10 against a $4,868 fair value.
The broad cohort base was $4,056 and a 20% age-based mileage uplift added $811, while the
AUTO.RIA page showed $3,343-$3,694. A claimed low odometer is weak evidence, especially on
an old car, and `interQuartileMean` is not necessarily the typical listing price in a broad cohort.

## Decision

Use AUTO.RIA percentile 50 (median) as the fair-value base, with interquartile and arithmetic
means only as fallbacks. Do not apply a positive analytical mileage adjustment unless AUTO.RIA
exposes VIN-report or VIN-check evidence. For a car aged 15 years or more, cap a positive
VIN-evidenced mileage adjustment at 5%. Negative mileage adjustments remain available.

> **Narrowed by [[0023-one-sided-mileage-adjustment|ADR-0023]] (2026-08-06).** The VIN-evidence
> exception and the 15-year 5% cap are **gone**: the mileage adjustment is now one-sided and may
> never raise fair value, whatever the VIN state. The median-first base below is unchanged.

## Consequences

False high-discount alerts from unverified low odometers are reduced with no new request type.
Each active cohort is refreshed once after deployment so the one-day cache cannot retain the prior estimator.
Some genuinely low-mileage cars without a report will be valued conservatively; this is preferred
until structured real-mileage data or a tighter cohort is available. Generation/trim-specific
cohorts are still a separate future improvement.

## Related

- [[0023-one-sided-mileage-adjustment|ADR-0023]] (narrows the mileage clause of this decision)
- [[0013-budget-stabilization-before-lifecycle-rechecks|ADR-0013]]
- [[vin-real-mileage]]
- [[profitability-definition]]
- [SPEC-011](../../specs/011-valuation-sanity-guards/spec.md)
