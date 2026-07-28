# Tasks: Valuation Sanity Guards

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

## Phase 1 - Specification

- [x] T001 Record the false-discount problem and acceptance criteria in `specs/011-valuation-sanity-guards/`.

## Phase 2 - Median anchor

- [x] T002 [US1] Add a failing median-preference contract test in `test/contract/auto-ria.spec.ts`.
- [x] T003 [US1] Prefer AUTO.RIA percentile median in `src/modules/sources/auto-ria/auto-ria.source.ts`.

## Phase 3 - Claimed-mileage guard

- [x] T004 [US2] Add failing verified/unverified and old-car mileage tests in `test/unit/mileage.spec.ts`.
- [x] T005 [US2] Apply VIN-evidence and age caps in `src/modules/valuation/mileage.ts`.
- [x] T005a [US1] Version the fair-value cache key and preserve snapshot cohort identity in `src/modules/valuation/benchmark-cache.service.ts`.

## Phase 4 - Verification and knowledge base

- [x] T006 Update the valuation decision, glossary, research, architecture, spec index, and session log.
- [x] T007 Run targeted Jest, typecheck, lint, and vault checks (repository-wide lint still reports one pre-existing calibration import-order warning outside this spec).
