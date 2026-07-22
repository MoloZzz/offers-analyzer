---
title: ADR-0009 — Rate limiting: monthly pool instead of hourly window
type: decision
status: Accepted
updated: 2026-07-22
---

# ADR-0009 — Rate limiting: monthly pool instead of hourly window

**Status:** Accepted
**Date:** 2026-07-22

## Context

The AUTO.RIA plan changed to **20,000 requests/month** instead of ~30/hour. The ceiling is
essentially unchanged (30/hr × 24 × 30 ≈ 21,600/mo) but the **shape** did: a fixed hourly window
became a monthly pool the operator can spend unevenly. Durable rate-budget storage already exists
([[0004-drop-redis-bullmq|ADR-0004]] — Postgres-backed `rate_budget_windows`); this ADR changes the
accounting unit and spending policy on top of it, not the storage mechanism.

What the pool unlocks that the hourly window did not:
1. **Nighttime quota stops burning.** Under the hourly cap, ~8 idle nighttime hours × 30 req/hr ≈
   240 req/day went to empty poll cycles — ~7,000/mo of dead quota. A monthly pool lets that budget
   shift to daytime, ~1.5× the effective daily budget for the same monthly figure.
2. **Bursts become possible** — e.g. a one-off calibration pull of 2,000–3,000 requests.
3. **Priority queue replaces round-robin.** Round-robin ([[B20]] in [[backlog]]) existed to stop one
   wide niche from starving the hourly window. With a monthly pool the constraint isn't equal
   sharing between niches, it's prioritizing requests by expected value.

## Decision

Replace the hourly rate-budget window with a **monthly pool + daily sub-budget + priority queue**:

```
daily_budget = (month_remaining_pool − reserve) / days_remaining_in_month
reserve = 15% of the pool, released 3 days before month end
priority queue; when the daily budget is exhausted, cut from the bottom:
  1. tier-1 re-check (near-threshold listings)
  2. new-listing detail fetches
  3. search / id-diff
  4. tier-2 re-check
  5. cohort averages (already cached daily)
```

**Non-negotiable:** keep the existing **token bucket (~1 request / 2 sec)** independent of the
monthly pool. A monthly quota does not guarantee the absence of an undocumented per-second limit;
bursting 2,000 requests in 10 minutes is a fast way to get banned.

### Target monthly allocation (indicative — recompute against actual active-listing counts per niche)

| Line item | req/mo |
|---|---|
| Search/id-list scans (day 10 min, night 30 min cadence); disappearance diff is free | 3,500 |
| New-listing detail fetches | 6,000 |
| Tier-1 re-check ([[SPEC-005]]) | 2,500 |
| Tier-2 re-check ([[SPEC-005]]) | 1,800 |
| Cohort average prices (cached 24h) | 1,500 |
| Cohort trend ([[SPEC-008]]) | 50 |
| Reserve (bursts, calibration, spikes) | 4,650 |
| **Total** | **20,000** |

This directly funds [[SPEC-005]]'s tiered re-check budget (~4,300 req/mo) — see
`context/backlog.md` for the full 2026-07-22 backlog and execution order.

## Consequences

**Positive:** effective daily throughput rises without a bigger monthly cap; enables the tiered
re-check in [[SPEC-005]] (the system currently scores a listing once at ingest and never revisits
it, which structurally misses price cuts that happen 3–5 weeks later); enables occasional
calibration bursts.

**Negative / trade-off:** more moving parts than a flat hourly cap — a daily sub-budget calculator,
a reserve carve-out, and a 5-tier priority cut order all need to be implemented and kept correct;
a bug in the daily-budget math could silently starve high-value requests (tier-1 re-check) while
low-value ones (cohort averages) still run, if the priority order is wrong or unenforced.

**Verification debt:** acceptance criteria (see backlog) require a dashboard/log of actual spend
by line item — without it, drift between the indicative table and reality won't be caught.

## Related
- [[decisions/README]] · [[0004-drop-redis-bullmq|ADR-0004]] · [[backlog]]
- Backlog items: SPEC-005 (tiered re-check, blocked by this ADR), SPEC-004, SPEC-008
