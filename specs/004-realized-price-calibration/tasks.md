# Tasks: Realized-Price Calibration (Survivorship Correction)

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Status: `[ ]` todo · `[~]` in progress · `[x]` done. `[P]` = parallelizable.

## Phase A — US4.1–4.2 (data collection)

- [x] T001 [US4.1] `SourceSearchResult.total` + `AutoRiaSource` parses `search_result.count`
      (same response — zero extra requests) — delegated → Sonnet
- [x] T002 [US4.1] `ListingDisappearance` entity + `Listing.lastSeenInSearchAt` +
      ENTITIES/`ListingsModule` wiring (explicit constraint/index names) — delegated → Sonnet
- [x] T003 [US4.1] Migration `1784806436997`: new table + column, backfill
      `UPDATE listings SET "lastSeenInSearchAt" = "lastSeenAt"`, symmetric down; re-run
      `migration:generate` → no churn; applied to dev DB — delegated → Sonnet
- [x] T004 [P] [US4.1] Pure fns (`src/modules/listings/disappearance.ts`): `isSearchEligible`,
      `profileCovers`, `priceCutStats`, `domDays`, `cohortKeyForListing`; constants
      `GRACE_HOURS=24`, `RELIST_WINDOW_DAYS=30`, `RELIST_MILEAGE_TOLERANCE_K=2` — delegated → Sonnet
- [x] T005 [P] [US4.2] Pure fn `isRelistMatch` (normalized-VIN equality, or
      markId+modelId+year+cityId ∧ |Δmileage| ≤ 2) — delegated → Sonnet
- [x] T006 [US4.1] `test/unit/disappearance.spec.ts` — 38 boundary-case tests — delegated → Sonnet
- [x] T007 [US4.1] `DisappearancesService.processCycle` (bulk bump, resurrect, grace,
      coverage, record idempotently, `status='removed'`; **no LISTING_SOURCE**) — delegated → Sonnet
- [x] T008 [US4.2] `DisappearancesService.checkRelist` (30-day window, mark
      `isRelist`/`relistListingId`/`relistDetectedAt`) — delegated → Sonnet
- [x] T009 [US4.1+4.2] `test/unit/disappearances-service.spec.ts` (fake-repo, 11 tests) — delegated → Sonnet
- [x] T010 [US4.1] Poll wiring: Phase-1 seen-id/eligibility accumulation; `processCycle`
      before Phase 2 (contained errors — detection failure never costs the cycle);
      `recordSeen(..., { seenInSearch: true })` in processNew + reobserve; passive Outcome
      `'disappeared'`; `checkRelist` on new listings
- [x] T011 [US4.1] Zero-API verified: no source dep in the service; the only diffed
      `this.source` line is the pre-existing search call capturing its full result;
      tsc clean, jest 26 suites / 169 tests green
- [ ] T012 [US4.1] Operator prerequisite: enable ≥1 persistent profile (no
      `submittedWithin`, ≤100 matches) in `config/search-profiles.json` — **operator action**
      (until then the feature is correctly inert: zero eligible profiles → zero events)

### Deferred follow-ups (not in Phase A)

- [ ] T013 Filter `status='active'` in `topByScore`/`getRecentlyEvaluated`/`nearMisses` so
      `/best`/`/top`/`/report` stop showing removed listings (operator-visible change —
      separate slice)

## Phase B — US4.3 (compute `k`) — tasks at pickup time

_Weekly cohort `k` computation (median/median, ≥30 events, `dom<60`, non-relist, non-voided),
fallback make+model → make → global 0.90; denominator from `average_price_snapshots`._

## Phase C — US4.4 (apply `k`) — tasks at pickup time

_`k` in ParameterSet; `X = RIA_average × k`; `/why` shows `k` + tier + event count._
