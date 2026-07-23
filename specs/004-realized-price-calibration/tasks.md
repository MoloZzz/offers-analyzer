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
- [x] T012 [US4.1] Operator prerequisite: a detection-capable profile —
      **resolved via the sweep (T014–T019)**: operator rejected model-pinned niches
      (2026-07-23); the market-wide sweep profile replaces the "persistent niche" route
- [x] T014 [US4.1b] `ProfileFilters.sweep?: boolean` + doc comment (jsonb, no migration)
- [x] T015 [US4.1b] Poll cycle excludes sweep profiles (never searched/ingested at 10-min
      cadence)
- [x] T016 [US4.1b] `DisappearancesService.processCycle` gains optional `graceHours` param
      (default `GRACE_HOURS`); `SWEEP_GRACE_HOURS = 30` exported
- [x] T017 [US4.1b] `SweepService` (polling module, `@Cron '30 3 * * *'`): paged budget-gated
      crawl per sweep profile (stop: empty page / short page / total reached; `MAX_SWEEP_PAGES`
      cap → incomplete), complete-sweep gate before detection, budget-abort stops the whole
      run, passive outcomes — delegated → Sonnet
- [x] T018 [US4.1b] `test/unit/sweep.spec.ts` — 7 tests (paging, total-stop, budget-abort,
      per-profile error isolation, empty sweep, non-sweep untouched, page-cap) — delegated → Sonnet
- [x] T019 [US4.1b] Sweep profile in `config/search-profiles.json` (Київщина ≤$15k 2010+,
      `sweep: true`, `dealerPolicy: 'label'`) — enabled; niche measured live at ~17.9k
      matches ⇒ ~179 pages/day ≈ 5,400 req/mo

### Deferred follow-ups (not in Phase A)

- [ ] T013 Filter `status='active'` in `topByScore`/`getRecentlyEvaluated`/`nearMisses` so
      `/best`/`/top`/`/report` stop showing removed listings (operator-visible change —
      separate slice)

## Phase B — US4.3 (compute `k`) — tasks at pickup time

_Weekly cohort `k` computation (median/median, ≥30 events, `dom<60`, non-relist, non-voided),
fallback make+model → make → global 0.90; denominator from `average_price_snapshots`._

## Phase C — US4.4 (apply `k`) — tasks at pickup time

_`k` in ParameterSet; `X = RIA_average × k`; `/why` shows `k` + tier + event count._
