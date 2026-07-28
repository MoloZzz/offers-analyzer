---
title: ADR-0012 — Material threshold for same-listing repeat alerts
type: decision
status: Accepted
updated: 2026-07-28
---

# ADR-0012 — Material threshold for same-listing repeat alerts

**Status:** Accepted  
**Date:** 2026-07-28

## Context

The former alerting guidance treated any strictly lower price for a known listing as new information. Tiered lifecycle re-checks will observe the same listing repeatedly; that policy would turn trivial edits into operator noise.

## Decision

For the **same listing id**, a repeat alert requires a current asking price at least 5% below the asking price in its previous alert. A 4.99% or smaller reduction is persisted and re-scored but is not notified. The rule is distinct from VIN-level relist de-duplication: a cheaper relist remains governed by its existing car-level baseline.

## Consequences

This reduces alert volume while retaining material movements. The feature must persist a per-listing alert baseline and make the boundary unit-testable. It supersedes the "strictly lower" same-listing clause in [[when-to-alert]].

## Related

- [[0009-monthly-rate-limit-pool|ADR-0009]] · [[0011-evidence-gated-scoring-rollout|ADR-0011]] · [[SPEC-005]] · [[when-to-alert]]
