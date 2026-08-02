---
title: ADR-0017 — Keep provider valuation evidence shadow-only
type: decision
status: Proposed
updated: 2026-08-02
summary: Introduce auditable AUTO.RIA provider evidence in shadow mode without changing live scoring.
---

# ADR-0017 — Keep provider valuation evidence shadow-only

**Status:** Proposed
**Date:** 2026-08-02

## Context

The current price core can produce an apparently confident bargain from a broad active-listing
cohort and an analytical mileage adjustment. The investigated Audi A6 Allroad was a concrete
example: the legacy explanation reached $6,825 while the contemporaneous AUTO.RIA market display
was around $5,000.

The product ultimately needs a price at which an operator can sell a car. Neither the legacy cohort
nor a provider market estimate proves that price: both observe market-position signals, while a
normal-sale/transaction estimate needs confirmed outcomes and explicit costs/horizon assumptions.
The supported AUTO.RIA AI valuation interface is a permissioned paid provider source with richer
listing-aware input, but it must be validated for source parity, coverage, cost, and retention
before it affects selection.

ADR-0010 and ADR-0011 already prohibit a casual scoring rollout. The system also has a strict
official-source/no-scraping boundary and a protected monthly source budget.

## Decision

1. Add an additive, immutable provider-evidence path for the target **active_listing_ask** only.
   It is explicitly named an AUTO.RIA provider active-market estimate, never a confirmed sale,
   resale price, quick-exit price, fair-value replacement, or buy ceiling.
2. Use the official AUTO.RIA AI valuation provider only after the operator supplies approved
   access. Prefer a listing-ID lookup when available; attribute mode requires a versioned
   valuation policy and actual mileage. Do not silently fall back from AI to the legacy
   average-price endpoint.
3. Keep provider policy versioning separate from scoring ParameterSet versioning. Persist source,
   input completeness, query mode, policy/adapter version, permitted comparable evidence, quality
   decision, and failure/budget state so /why remains reproducible without a network request.
4. Run the provider disabled by default and shadow-only when enabled. It uses a dedicated,
   low-priority allocation inside the shared budget ledger and a deterministic sample plus manual
   checks.
5. Do not change legacy fair value, score, rank, threshold, opportunity qualification, notification
   timing, factor activation, or survivorship correction k in this decision. A future activation
   needs a separate approved decision after source-parity, budget, coverage, and actual-outcome
   evidence satisfy ADR-0011.

## Consequences

- The operator gains auditable market-position evidence and can see why it disagrees with the
  legacy benchmark without being given a false resale claim.
- The implementation adds provider access/cost, contract fixtures, additive persistence, budget
  allocation, and an audit workflow.
- A provider outage, permission problem, bad schema, or exhausted allocation leaves current
  discovery and alerts unchanged; it becomes visible evidence rather than a hidden fallback.
- This deliberately does **not** fix live alerts immediately. That delay is the safety mechanism:
  active listings and source/UI parity are not enough to validate a resale model.

## Related

- [[0010-defer-factor-activation-until-k]]
- [[0011-evidence-gated-scoring-rollout]]
- [[0014-conservative-benchmark-and-mileage-guard]]
- [[specs/README]]
- [[research/profitability-definition]]
