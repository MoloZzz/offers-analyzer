---
title: ADR-0024 — Narrow the cohort with drivetrain proxies, not generation and trim
type: decision
status: Accepted
updated: 2026-08-06
summary: /average_price cannot filter by generation or modification, so the ladder gains exact-year and gearbox+fuel tiers as proxies; the real filters stay behind ADR-0017.
---

# ADR-0024 — Narrow the cohort with drivetrain proxies, not generation and trim

**Status:** Accepted
**Date:** 2026-08-06

## Context

The operator reported that the computed market price does not track the real market. After
[[0023-one-sided-mileage-adjustment|ADR-0023]] removed the claimed-odometer uplift, the next
suspected leak was the cohort itself: the live path values a car against **make + model + year±1
nationwide**, which averages a base trim against a loaded one and can straddle a generation change.
The requested fix was to add generation and trim to the cohort.

**The endpoint we use cannot express either.** Fair value comes from
`GET /auto/average_price`, whose documented filter set is `marka_id`, `model_id`, `yers[]`,
`raceInt[]`, `gear_id[]`, `fuel_id[]`, `auto_options[]` and `city_id`. Generation and modification
are catalog-navigation resources there, not query parameters.

They *are* real parameters — on `POST /auto/ai-avarage-price/`, which accepts `generationId` and
`modificationId` directly and is already implemented as `AutoRiaAiValuationProvider`. That path is
paid, credential-gated, and [[0017-shadow-valuation-evidence|ADR-0017]] §5 keeps it shadow-only
until a separate approved decision. So the literal request is not a cohort change at all; it is a
provider promotion.

A second constraint shapes the design. [[0013-budget-stabilization-before-lifecycle-rechecks|ADR-0013]]
and SPEC-010 made cohorts deliberately *reusable*: the mileage band was dropped from the live path
because a live mileage figure is close to one car's fingerprint and defeats the 24-hour cache. Any
new tier must be shared by a slice of the market, not by one listing.

## Decision

1. Add two tiers to `cohortCandidates`, above the existing year±1 cohort and below the (live-path
   filtered) mileage band:
   - **make+model + exact year + gearbox + fuel**
   - **make+model + year±1 + gearbox + fuel**

   Gearbox and fuel stand in for **trim**: within one model-year they are what actually splits the
   price, because a diesel manual and a petrol automatic are different cars to a buyer. An exact
   year stands in for **generation**, being the only lever the endpoint offers on that axis. Both
   are named as proxies in code and in `/why`, never as the real thing.

2. Keep the widening ladder as the safety mechanism. A proxy cohort that does not reach
   `MIN_USEFUL_SAMPLES` falls through to the wide one, so the change cannot trade a broad average
   for a confident average over three comparables.

3. Band on whichever of gearbox and fuel the source supplied; skip the tiers entirely when neither
   is known, or when `year` is the `0` missing-value sentinel. A tier that adds no constraint is a
   duplicate of the one below it, and duplicates cost requests.

4. Treat AUTO.RIA's HTTP 400 `{message:"Not Enough Data"}` on `/average_price` as a **zero-sample
   result** rather than an error (new `SourceNoDataError`, caught in the adapter). Thin cohorts are
   the expected outcome of narrower tiers; without this the cache stores nothing and every listing
   matching a barren cohort re-spends the request for the life of the deployment.

5. Append the drivetrain band to `BenchmarkCacheService.cohortKey` instead of folding it into the
   fixed field list, so a bandless cohort key stays **byte-identical** to stored history.
   `average_price_snapshots` and `listing_disappearances.cohortKey` join on that string, and SPEC-004
   calibration depends on the join surviving.

6. Do **not** promote the AI endpoint to the live benchmark in this decision. ADR-0017 §5 stands.

## Consequences

- Fair value is compared against more like-for-like cars whenever a model-year has enough
  diesel-manual (or petrol-automatic) supply, which is the common case for the volume models the
  operator monitors. Where it does not, behaviour is exactly as before.
- Cost rises by at most two extra tier-5 `/average_price` calls per **cohort** (not per listing),
  bounded by the 24-hour cache and now also by negative caching, which removes a pre-existing
  amplifier that would have re-paid every "Not Enough Data" call.
- The benchmark may move in **either** direction — this is a comparability fix, not a safety guard
  like ADR-0023. A base trim previously flattered by loaded comparables will show a smaller
  discount; a loaded trim will show a larger one. Both are more truthful, and both change the alert
  set, so the first production cycles deserve a look.
- `assessment-confidence.ts` gains coverage weights for the two new tiers (0.85 / 0.75, between the
  banded and the bare year range). That output is display-only and never multiplied
  ([[0018-assessment-confidence-and-monetary-output|ADR-0018]]), so no score moves because of it.
- This is a deterministic comparability change with no `k`, no factor bounds, and no ParameterSet
  activation, so it sits outside the [[0011-evidence-gated-scoring-rollout|ADR-0011]] gates — the
  same class as ADR-0014 and ADR-0023.
- Real generation/modification cohorts remain available and unclaimed. Promoting them is a separate
  decision with real operator gates (credentials, approved terms, per-request cost, a budget
  allocation), and this ADR deliberately does not pre-approve it.

## Related

- [[0017-shadow-valuation-evidence]]
- [[0013-budget-stabilization-before-lifecycle-rechecks]]
- [[0014-conservative-benchmark-and-mileage-guard]]
- [[0023-one-sided-mileage-adjustment]]
- [[why-no-opportunities]]
- [[overview]]
