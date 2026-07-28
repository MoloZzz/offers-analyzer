# Tasks: Listing Lifecycle and Tiered Re-checks

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Status: `[ ]` todo. `[P]` = parallelizable.

## Phase 1 — Foundation

- [ ] T001 Add lifecycle fields/indexes and an additive migration in `src/modules/listings/entities/listing.entity.ts` and `src/common/database/migrations/`.
- [ ] T002 Add pure tier, interval, DOM, and repeat-alert decision functions in `src/modules/listings/lifecycle-recheck.ts`.
- [ ] T003 [P] Add boundary tests for tier assignment, urgency promotion, and 5% materiality in `test/unit/lifecycle-recheck.spec.ts`.

## Phase 2 — Due-work selection

- [ ] T004 Add active-only due selection, completion, and budget-denial retry behavior in `src/modules/listings/lifecycle-rechecks.service.ts`.
- [ ] T005 [P] Test selection order, removed-listing exclusion, and deferred work in `test/unit/lifecycle-rechecks.service.spec.ts`.
- [ ] T006 Wire a configuration-controlled lifecycle scheduler into `src/modules/polling/poll.service.ts` with profile context and tier-1/tier-4 budget attribution.

## Phase 3 — User Story 1: Re-check near-deals (P1)

**Goal**: Re-score a due active near-deal after a direct re-check.

**Independent Test**: A due tier-1 listing with a lower fetched price records the change and is re-evaluated without altering new-listing flow.

- [ ] T007 [US1] Extend `src/modules/polling/poll.service.ts` to persist lifecycle schedule after active evaluations and execute due re-checks.
- [ ] T008 [US1] Cover changed-price re-score and unchanged-price schedule advancement in `test/unit/poll.spec.ts`.

## Phase 4 — User Story 2: Prioritize motivated sellers (P1)

**Goal**: Escalate long-lived or price-cut listings.

**Independent Test**: DOM >45 and a persisted cut promote exactly one tier, capped at tier 1.

- [ ] T009 [US2] Feed `PriceObservation`/listing age evidence into schedule recomputation in `src/modules/listings/lifecycle-rechecks.service.ts`.
- [ ] T010 [US2] Add DOM and cut-escalation integration cases in `test/unit/lifecycle-rechecks.service.spec.ts`.

## Phase 5 — User Story 3: Material repeat alerts (P2)

**Goal**: Notify again only for a qualifying at-least-5% same-listing reduction.

**Independent Test**: 4.99% is silent and 5.00% sends once.

- [ ] T011 [US3] Persist the same-listing alerted-price baseline and decision in `src/modules/notifications/alerted-cars.service.ts` or a focused lifecycle helper.
- [ ] T012 [US3] Use the decision before notification dispatch in `src/modules/polling/poll.service.ts`.
- [ ] T013 [US3] Add 4.99%/5.00% and idempotency cases in `test/unit/poll.spec.ts`.

## Phase 6 — Rollout and verification

- [ ] T014 Add lifecycle enablement configuration and operator runbook note in `src/common/config/` and `knowledge-offers-analyzer/operations/environment-setup.md`.
- [ ] T015 Verify lifecycle activity/deferrals in `/budget` through `test/unit/rate-budget.spec.ts` and `test/unit/budget-report.spec.ts`.
- [ ] T016 Update `knowledge-offers-analyzer/architecture/overview.md`, `knowledge-offers-analyzer/domain/glossary.md`, `knowledge-offers-analyzer/context/backlog.md`, and today's context log after implementation.
- [ ] T017 Run focused Jest, `rtk npm.cmd run typecheck`, `rtk npm.cmd run lint`, and `rtk npm.cmd run vault:check`.

## Dependencies and delivery order

T001–T006 are foundational. US1 is the MVP and depends on them. US2 builds on schedule recomputation; US3 can be developed after T001/T002 but is deployed with US1. T014–T017 are required before live enablement.

Parallel work: T003 can run beside T001/T002; T005 beside T004's interface work; US3's baseline implementation can proceed beside US2 after the foundational contract is stable.
