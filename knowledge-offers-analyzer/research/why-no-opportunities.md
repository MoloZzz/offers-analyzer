---
title: Research — why 0 opportunities, and how to reach business value
type: research
status: Implemented
updated: 2026-07-16
---

# Why we find 0 opportunities — and how to fix it

> Symptom: after a real run, 0 opportunities. This is a design/tuning problem with a concrete,
> data-backed root cause, not bad luck. Related: [[profitability-definition]], [[monitoring-approaches]].

## Root cause (from our own logs)

The cohort we send to `/average_price` is **far too narrow**: make + model + **city** + **exact year**
+ mileage band. A real poll log:

```
/average_price?...&city_id=287&yers=2018&yers=2018&raceInt=7&raceInt=47 → { "total": 1, ... }
```

`total` (sampleSize) = **1**. The confidence gate needs `sampleSize ≥ minSamples` (default **10**), so
**every** narrow cohort is rejected → never an opportunity, regardless of price. The same narrowness
also makes many cohorts return HTTP 400 "Not Enough Data" → the listing is skipped entirely.

For comparison, the broad cohort (make + model only) returned `total: 3845`. So the sample collapses
from thousands to ~1 the moment we add city + exact year + tight mileage. **The confidence gate is
doing its job; the cohort is starving it.**

## Fixes, by leverage (business value = catch underpriced cars)

1. **Widen the cohort (the unblocker).** Drop `city_id` (compare nationally, or by region not city),
   use a **year range (±1)** not exact, keep a reasonable mileage band. Target sampleSize ≳ 30. Add a
   **graceful widen-and-retry** when `/average_price` returns "Not Enough Data" instead of skipping.
2. **Surface candidates, don't stay silent.** Lower the default deal-score threshold (≈0.15) and
   `minSamples` (≈15), and add a **top-candidates view** (`/search` / digest) showing the best-scoring
   recent listings even below the alert bar. A ranked list is value; silence is not.
3. **Ingest newest listings, market-wide** (operator's idea). Broaden the profile (region + price cap,
   **empty** make-model constraints) and restrict to freshly-posted listings so we evaluate the
   **freshest** cars across many models — that's where mispriced cars appear and get snapped up fast.
   Each new listing is still valued against *its own* (widened) cohort.
4. **Sanity-check the benchmark currency** (confirm `/average_price` is USD, or normalize) so the
   discount isn't comparing USD asking vs a non-USD average.

## What we implemented (2026-07-16)

- **(1) Widen the cohort** — `valuation/cohort.ts`: `cohortCandidates` tries **make+model+year±1**, then
  **make+model** only, dropping `city_id` and mileage; `resolveBenchmark` walks them until
  `sampleSize ≥ 10`, gracefully skipping thin cohorts ("Not Enough Data") instead of dropping the
  listing. Wired into both the poll and the on-demand `/check`.
- **(2) Surface candidates** — default `minDealScore` lowered **0.3 → 0.15**; new bot command
  **`/best`** (`QueryService.topCandidates` → `ListingsService.topByScore`) lists the best-scoring
  evaluated listings **even below** the alert bar. Silence is no longer the only output.
- **(3) Newest by market** — new query knob `submittedWithin` maps to AUTO.RIA **`top`** (submission
  period: 1=last hour, 2=today, 8=last 3h …). A profile with **empty `makeModelPairs`** + region +
  `priceTo` + `submittedWithin` ingests the freshest listings market-wide. Example profile shipped
  **disabled** (it is budget-heavier; operator opts in).

> **Correction to the earlier "newest-first" idea (B3).** AUTO.RIA `order_by` only exposes `0` (default),
> `1` (cheap→expensive), `2` (expensive→cheap) — there is **no** "newest" sort value. Freshness is
> instead controlled by the **`top`** submission-period filter, which is what we use. Verified against
> the REST API docs (`AUTO_RIA_API` README, "Сортировка" / "Период подачи").

## Recommendation

Done: **(1)+(2)+(3)**. This is a refinement of ingestion + valuation, not a new epic; spec 001
(cohort/threshold/newest) is updated in place.

## Related
- [[00-INDEX]] · [[profitability-definition]] · [[backlog]]
