# Tasks: Monitoring Budget Stabilization

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

## Phase 1 — Foundation

- [x] T001 Document the production-demand evidence and paused SPEC-005 boundary in `specs/010-budget-stabilization/spec.md`.

## Phase 2 — US1: Preserve discovery

- [x] T002 [US1] Add failing bounded-unscored-recovery and scored-listing exclusion coverage in `test/unit/poll.spec.ts`.
- [x] T003 [US1] Limit legacy recheck selection to one unscored listing per profile in each 30-minute window in `src/modules/polling/poll.service.ts`.

## Phase 3 — US2: Reuse benchmark evidence

- [x] T004 [US2] Add reusable cohort hot-path coverage in `test/unit/cohort.spec.ts`.
- [x] T005 [US2] Select reusable year/model cohorts before any live mileage-banded request in `src/modules/valuation/cohort.ts`.

## Phase 4 — US3: Contain tier-5 refusal

- [x] T006 [US3] Add a poll continuation test for a refused benchmark in `test/unit/poll.spec.ts`.
- [x] T007 [US3] Contain benchmark budget exhaustion to the current evaluation in `src/modules/polling/poll.service.ts`.

## Phase 5 — Verification and knowledge base

- [x] T008 Run targeted Jest, typecheck, lint, and vault checks; synchronize `knowledge-offers-analyzer/` and mark completed tasks.
