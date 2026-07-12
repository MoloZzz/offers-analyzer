---
title: Backlog — deferred items
type: context
updated: 2026-07-13
---

# Backlog (future — deliberately not in v1)

Kept out of v1 to stay simple. Promote an item to a spec/ADR when it's picked up.

## Valuation & data
- **Re-observe known listings** (periodically refresh their prices) → enables **price-drop detection (FR-009)** and own market statistics over time. Competes for the API budget — needs a budget-sharing policy.
- **Own-statistics valuation**: compute fair value from our stored listings (median / percentiles per cohort) instead of relying only on the RIA average. More robust; needs accumulated data. See [[profitability-definition]].
- **Relist / duplicate heuristic** (VIN / phone-hash) for richer FR-008.

## Infrastructure
- **Durable rate budget**: move the in-memory counter to Postgres if process restarts risk breaching the hourly cap, or when running more than one instance. See [[0004-drop-redis-bullmq|ADR-0004]].
- **Paid API tier / wider niche coverage** (beyond the free ~30/hr).
- **Additional listing sources** behind the `ListingSource` port.

## Related
- [[00-INDEX]] · [[goals]] · [[monitoring-approaches]]
