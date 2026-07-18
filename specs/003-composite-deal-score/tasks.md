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

Spec authored; no implementation started. Keep this block in sync with the code (DoD #4).

## Phase F: Foundational — composite skeleton (blocking)

- [ ] T001 [F] `Factor` interface + `FactorScore` value object + pure composition
      (`Π modifiers`, per-factor clamps, global `upliftCap`, `priceCore > 0` opportunity gate)
      in `computeValuation`; neutral behavior bit-identical (SC-001 guard test).
- [ ] T002 [F] ParameterSet v-next: `factorBounds` (all neutral) + `upliftCap` +
      `heuristicTableHashes`; seed/migrate via existing candidate→activate mechanics.
- [ ] T003 [F] 0–100 presentation: pure `toTotal100`/`toSubScore100`; extend `formatWhy` +
      alert formatter with total + factor lines (neutral factors hidden).
- [ ] T004 [F] Heuristic-table loader (`config/heuristics/`, boot validation, content hash).
- [ ] T005 [F] (couples with B23) persist `factors` in the evaluation explanation snapshot.

## Phase 1: US1 Liquidity + US2 Repair-risk (P1)

- [ ] T010 [P] [US1] `liquidity-tiers.json` (curated: tier A–D by make/model; make + segment
      fallbacks) + pure `liquidityFactor` + unit tests (tiered, unknown→neutral).
- [ ] T011 [P] [US2] `repair-risk.json` pattern rules (gearbox: DSG/CVT/air-susp; engine/fuel/
      age combos; reliable-list → LOW) + pure `repairRiskFactor` + unit tests.
- [ ] T012 [US1+2] wire both factors into composition; integration cases: same-discount
      liquid vs illiquid ordering; BMW-2005-diesel HIGH vs Corolla LOW (SC-002).
- [ ] T013 [US1+2] vault: glossary terms (Liquidity score, Repair-risk), how-it-works factor
      list, overview valuation row.

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
