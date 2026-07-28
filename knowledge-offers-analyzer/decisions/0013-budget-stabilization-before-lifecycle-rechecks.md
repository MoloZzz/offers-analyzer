---
title: ADR-0013 — Stabilize budget demand before lifecycle rechecks
type: decision
status: Accepted
updated: 2026-07-28
---

# ADR-0013 — Stabilize budget demand before lifecycle rechecks

**Status:** Accepted
**Date:** 2026-07-28

## Context

The first production ledger showed 485 `recheck_detail` calls on 2026-07-28, caused by the legacy `5 × every 10 minutes` poll loop rather than paused SPEC-005. It also showed 848 `cohort_average` calls for 675 new details: a mileage-banded cohort key is often unique per car, so a 24-hour cache could not amortize the first live average request. Those demand patterns make the current 20,000-request pool incompatible with preserving new-listing discovery.

## Decision

Before any lifecycle recheck rollout, production keeps only bounded recovery rechecks for never-scored listings: one per profile in a 30-minute window. Already scored listings receive no legacy routine recheck. Benchmark resolution starts with reusable make/model/year cohorts and retains the existing analytical mileage adjustment; it does not issue a live mileage-banded request on the ingestion path. A refused tier-5 benchmark affects only that fetched listing, not the rest of the poll cycle.

SPEC-005 remains paused until actual operator-profit evidence exists. The daily sweep remains unchanged in this decision because an incomplete crawl would compromise disappearance evidence; its true allocation and coverage require a separate reforecast.

## Consequences

**Positive:** new listing discovery is protected, the cohort cache becomes shareable, and a low-priority denial cannot prematurely stop collection.

**Trade-off:** scored listings no longer receive opportunistic price-drop alerts until SPEC-005 is explicitly approved; benchmarks are less individually mileage-specific, though the existing mileage adjustment remains. The ledger must be observed and reconciled before widening work again.

## Related

- [[0009-monthly-rate-limit-pool|ADR-0009]] · [[0011-evidence-gated-scoring-rollout|ADR-0011]] · [[SPEC-005]]
