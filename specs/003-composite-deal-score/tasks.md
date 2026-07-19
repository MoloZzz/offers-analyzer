# Tasks: Composite Total Deal Score

**Spec**: `spec.md` · **Plan**: `plan.md` · **Created**: 2026-07-18

## Format: `[ID] [P?] [Story] Description`

`[P]` = parallelizable (pure, no shared files). Stories: F (foundational), US1–US5.

## Path Conventions

`src/modules/valuation/factors/*` (new), `config/heuristics/*.json` (new),
`src/modules/valuation/{valuation.service,mileage,mileage-risk,condition,red-flags}.ts`,
`src/modules/calibration/*` (ParameterSet seed), `src/modules/notifications|query` (rendering),
`test/unit/*`, `test/integration/scoring-pipeline.spec.ts`.

## Status (2026-07-18)

Phase F core landed (T001–T003): behavior-identical composite skeleton, SC-001 held. T004
(heuristic loader) and T005 (B23 persist) deferred — no factors/tables exist yet, so both are pulled
forward to the phase that first ships a factor / to the B23 work respectively. tsc clean;
`factor.spec` 7/7; typeorm-importing suites deferred to the dev machine (sandbox jest degraded).
Keep this block in sync with the code (DoD #4).

## Phase F: Foundational — composite skeleton (blocking)

- [x] T001 [F] `Factor` interface + `FactorScore` value object + pure composition
      (`composeFactors`: Π modifiers, dampeners in full, combined uplift clamped to `upliftCap`) +
      `priceCore > 0` opportunity gate in `computeValuation`; `ValuationResult` += `priceCore`,
      `factors[]`, `total100`. Empty factor list → `score === priceCore` (SC-001). `factor.spec` 7/7.
- [x] T002 [F] `ScoringParams` (jsonb) += optional `factorBounds` + `upliftCap` +
      `heuristicTableHashes`; `buildSeedParams` seeds neutral; absent → `DEFAULT_UPLIFT_CAP` (1.25),
      so **existing v1 rows stay valid with no migration**. (candidate→activate mechanics unchanged,
      used when a factor actually ships.)
- [x] T003 [F] 0–100 presentation: pure `toTotal100` (score→[0,100], at-market=50) / `toSubScore100`
      (modifier→[0,100], neutral=50); `formatWhy`, `formatOpportunity`, `formatAssessment` render the
      total + per-factor lines (empty until factors ship). Additive → formatter `toContain` tests hold.
- [ ] T004 [F] Heuristic-table loader (`config/heuristics/`, boot validation, content hash) —
      **deferred to Phase 1** (first factor to need a table brings its loader; nothing to load yet).
- [ ] T005 [F] (couples with B23) persist `factors` in the evaluation explanation snapshot —
      **deferred to the B23 work** (persist-explanation); factor snapshots land with it.

## Phase 1: US1 Liquidity + US2 Repair-risk (P1)

- [x] T004 [F] Heuristic-table loader — landed here (first factor needs it): `factors/tables.ts`
      `HeuristicTablesService` loads/validates `config/heuristics/*.json` at boot, tolerant of
      absence (bad table → factor off, never crashes scoring), records content hashes.
- [x] T010 [P] [US1] `config/heuristics/liquidity-tiers.json` (curated A–D by make/model + make
      fallback) + pure `factors/liquidity.ts` `liquidityFactor` (tier→modifier within ParameterSet
      bounds; unlisted→neutral-with-reason; gated off when bounds/table absent). `liquidity.spec` 7/7.
- [x] T011 [P] [US2] `config/heuristics/repair-risk.json` pattern rules (gearbox: DSG/CVT/air-susp; engine/fuel/
      age combos; reliable-list → LOW) + pure `repairRiskFactor` + unit tests. Source fields verified
      in live `/info` (gearboxName, fuelName, modificationName, gearBoxId, fuelId) and mapped in
      `AutoRiaSource` → `ListingDetail`.
- [x] T012 [US1] wire liquidity into composition (`computeValuation(input, params, tables)`, gated by
      `factorBounds.liquidity`); `ValuationInput` += make/model; `ValuationService` injects the loader;
      poll + query pass make/model; `PHASE1_FACTOR_BOUNDS` (enable = activate a ParameterSet with these
      bounds — default stays neutral, SC-001). Integration: liquid-vs-illiquid ordering + price-dominance
      (US2 wiring rides on T011).
- [x] T013 [US1] vault: glossary (Liquidity score), how-it-works factor list, overview valuation row.

## Phase 2: US3 Seller-motivation & seller-type (P2)

- [ ] T020 [P] [US3] `negotiation-lexicon.json` (торг/терміново/переїзд/потрібні гроші/купив
      нове авто…, uk+ru) + pure scanner (negation-aware) + unit tests («без торгу» no-fire).
- [ ] T021 [US3] seller-type modifier (owner ↑ / reseller ↓; dealer only under policy
      `label`/`ignore` — `exclude` precedence test) + wire + tests.

## Phase 3: US4 Positive signals (P2 — supersedes B24 "never inflate")

- [ ] T030 [US4] `positive-lexicon.json` (1 owner, service book/history, official service,
      2 keys, major service done, garage kept, factory LPG, new timing belt/suspension…) +
      pure scanner (anti-gaming: concrete facts only) + unit tests.
- [ ] T031 [US4] uplift factor + reduce `unverified_bargain` dampening (`mileage-risk.ts`
      consumes positive evidence); price-dominance permutation test (SC-003); Dokker-class
      integration case; close B24 in backlog as absorbed.

## Phase 4: US5 Segment mileage norms (P2)

- [ ] T040 [US5] `mileage-norms.json` + pure `segmentOf(body, fuel, modelClass)`; rewire
      `expectedMileageK` in `mileage.ts` (M2) and `mileage-risk.ts` (B21a); default fallback =
      current 15k; unit tests (van/hatch/sports/unknown).
- [ ] T041 [US5] `/why` shows segment + norm; vault sweep: flat-15k references updated
      (profitability-definition, how-it-works).

## Phase 5: Rollout & docs

- [ ] T050 threshold re-validation after Phase 1 and Phase 3 (`/report` + calibration
      proposals on the new distribution) — record in session log.
- [ ] T051 SC-006 precision check (30-day) vs pre-003 baseline; note results in
      profitability-methods-coverage.
- [ ] T052 final vault sweep + specs/README status update.

## Dependencies

F blocks everything. US1/US2 parallel after F. US3/US4 parallel after F (share the scanner
infra — build once in whichever lands first). US5 independent after F. Rollout tasks trail
their phases.

## Related

- ADR-0006 · ADR-0005 · spec 002 (ParameterSet/calibration mechanics) · vault backlog epic
