# Implementation Plan: Realized-Price Calibration (Survivorship Correction)

**Spec**: [spec.md](spec.md) · **Created**: 2026-07-23 · **Status**: Phase A in progress

## Summary

Collect realized-"sale" events (listing disappearances) at zero API cost by diffing each poll
cycle's per-profile id lists against a `last_seen_in_search_at` timestamp on `listings`, with
eligibility/coverage/grace filters that eliminate the systematic false-positive sources
(submittedWithin window aging, paging truncation, uncovered listings, transient flakiness).
Events carry the full calibration payload (cohort key, last USD price, DOM, price-cut stats)
so later phases can compute and apply the correction factor `k` without re-reading history.

## Technical Context

- **Mechanism**: `lastSeenInSearchAt` column bulk-bumped in poll Phase 1 for all seen ids;
  candidates = active listings absent > `GRACE_HOURS=24`. Rejected alternative: per-profile
  id-snapshot table — more state, same failure modes.
- **False-disappearance handling** (the core design):

  | Source | Handling |
  |---|---|
  | `submittedWithin` window aging | Profile never detection-eligible (sightings still bump) |
  | Paging truncation | Ineligible when `total > ids.length` (or total missing ∧ ids ≥ 100); `SourceSearchResult` gains `total` parsed from `search_result.count` (same response, free) |
  | Listing covered by no running search | Pure `profileCovers(profile, listing)` over stored attributes; ≥1 eligible covering profile required |
  | Transient flakiness / moderation | 24h grace + resurrection path (reappearance voids the event via `reappearedAt`) |
  | Price-band exit (price increase) | Accepted residual risk — biases `k` upward = conservative |
  | Relist under new id | US4.2 `isRelist` marking; excluded from calibration |

- **Bias directionality**: residual false positives (long-sitters, band exits) inflate the
  numerator median → `k` biased toward 1.0 → under-correction. Fails conservative, matching
  the `k ≥ 0.97` falsification criterion.
- `disappearedAt = lastSeenInSearchAt` (last confirmed sighting), not detection time — grace
  must not skew DOM.
- **Passive Outcome `'disappeared'`** (spec 002 E2c-later): recorded from the poll layer
  (PollService already imports CalibrationModule; avoids a listings→calibration dependency).
  Inert to all current consumers (precision/weight learning read manual labels only).
- **Zero-API guarantee is structural**: `DisappearancesService` does not inject
  `LISTING_SOURCE`.
- Cohort key reuses `BenchmarkCacheService.cohortKey` + `MILEAGE_BAND_K` (static import, no
  DI, no module cycle) — same format as `average_price_snapshots`, so US4.3 joins for free.
- `Listing.mileage` is in **thousand km** → relist tolerance ±2k km = ±2 stored units.

## Constitution Check

- **I (Spec-driven)** ✅ this spec + plan + tasks precede code.
- **II (Zero-budget bias)** ✅ detection adds zero requests; structurally enforced (FR-409).
- **III (Explainable)** ✅ events carry full provenance (`detectionMode`, sighting times);
  `/why` integration comes with US4.4 when `k` is applied.
- **IV (Tunable via ParameterSet)** ✅ `k` will live in ParameterSet (US4.4); collection-side
  constants (`GRACE_HOURS`, relist window/tolerance) are code constants per house style.
- **V (Graceful degradation)** ✅ no eligible profile → feature inert (SC-402); missing
  mileage/VIN → wider cohort key / VIN path skipped, never guessed.
- **VI (Reversible)** ✅ append-only event table; resurrection voids rather than deletes;
  migration has symmetric down.

## Data Model

New table **`listing_disappearances`** (entity
`src/modules/listings/entities/listing-disappearance.entity.ts`):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `listingId` | uuid, **unique** (`UQ_listing_disappearances_listingId`) | one event per listing, ever |
| `cohortKey` | varchar, nullable | banded key (year±1, mileage±25k), format = benchmark cache; year-only when mileage missing; null when markId/modelId missing |
| `lastKnownPriceUsd` | numeric | latest `price_observations.amountUsd`, fallback `currentAmount` |
| `firstSeenAt` / `disappearedAt` | timestamptz | `disappearedAt` = last sighting; index `IDX_listing_disappearances_disappearedAt` |
| `domDays` | int | `round((disappearedAt − firstSeenAt)/day)` |
| `priceCutsCount` / `hadPriceCut` | int / bool | decreasing steps in observations / any obs cheaper than first |
| `isRelist` / `relistListingId` / `relistDetectedAt` | bool default false / uuid null / tstz null | US4.2 |
| `reappearedAt` | timestamptz, nullable | resurrection voids the event |
| `detectionMode` | varchar | `'live'` \| `'backfill'` (initial-wave rows, stale `disappearedAt`) |
| `createdAt` | timestamptz | |

`listings` += `lastSeenInSearchAt` timestamptz nullable, migration-backfilled `= "lastSeenAt"`.

## Design & Phasing

- **Phase A — US4.1–4.2 (this implementation)**: sighting bump + eligibility + coverage +
  grace + event recording + resurrection + relist marking + passive outcome. Slices:
  A (source `total` + entity + migration), B (pure decision functions), C (service),
  D (poll wiring), E (vault/docs). Each slice ends tsc-clean + jest-green.
- **Phase B — US4.3 (later)**: weekly job computing `k` per cohort (median/median, ≥30
  events, `dom < 60`, non-relist, non-voided, `detectionMode='live'` preferred), fallback
  chain make+model → make → global (0.90). Denominator from `average_price_snapshots`.
- **Phase C — US4.4 (later)**: `k` into `ParameterSet`; `X = RIA_average × k` in valuation;
  `/why` shows `k`, source tier, event count.

## Complexity / risk tracking

- `profileCovers` re-implements search-filter semantics locally — drift risk vs `toQuery`;
  mitigated by unit tests per filter dimension and by conservative bias on mismatch (a
  wrongly-uncovered listing just never becomes a candidate).
- Backfill rows have weeks-stale `disappearedAt` → quarantined via `detectionMode`.
- With only the today-profile enabled the feature records nothing — operator must enable a
  persistent profile (tasks T012).

## Related

- [spec.md](spec.md) · [tasks.md](tasks.md) · ADR-0005 · ADR-0006 · ADR-0009
