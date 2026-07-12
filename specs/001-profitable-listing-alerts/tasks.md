# Tasks: Profitable Listing Alerts

**Input**: Design documents from `specs/001-profitable-listing-alerts/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — the constitution (Principle VI) mandates unit tests for core logic and
contract tests for the external API.

**Organization**: Grouped by user story (US1 P1 = MVP, US2 P2, US3 P3) for independent delivery.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1/US2/US3 (setup, foundational, polish have no story label)

## Path Conventions

Single NestJS backend: `src/`, `test/` at repo root (per plan.md).

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Initialize NestJS project (package.json, strict tsconfig, `src/main.ts`, `src/app.module.ts`) at repo root
- [ ] T002 [P] Configure ESLint (typescript-eslint strict) + Prettier in `.eslintrc.cjs`, `.prettierrc`
- [ ] T003 [P] Add dependencies (TypeORM, pg, bullmq, ioredis, @nestjs/schedule, nestjs-telegraf, @nestjs/config, class-validator/transformer, undici, jest, nock) in `package.json`
- [ ] T004 [P] Add `docker-compose.yml` for local PostgreSQL + Redis
- [ ] T005 Configure `@nestjs/config` + `.env` schema and validation in `src/common/config/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [ ] T006 Setup TypeORM datasource + migration tooling in `src/common/database/`
- [ ] T007 [P] Error handling + structured logging in `src/common/`
- [ ] T008 [P] Shared `Money` type + currency enum in `src/common/types/`
- [ ] T009 [P] Define ports (`ListingSource`, `Notifier`, `ExchangeRate`) in `src/modules/*/ports/` per `contracts/`
- [ ] T010 Setup BullMQ module + Redis connection in `src/modules/scheduling/`
- [ ] T011 Implement Redis token-bucket **rate budget** in `src/modules/scheduling/rate-budget.service.ts`
- [ ] T012 Create all entities + initial migration (SearchProfile, Listing, PriceObservation, FairValueBenchmark, Opportunity, Subscriber, Notification) per `data-model.md` in `src/modules/*/entities/` and `src/migrations/`

**Checkpoint**: Foundation ready.

---

## Phase 3: User Story 1 - Get alerted to a profitable listing (Priority: P1) 🎯 MVP

**Goal**: A configured niche produces a Telegram alert for a new below-market, low-risk listing.

**Independent Test**: Seed one profile, feed AUTO.RIA fixtures for a listing ~18% below cohort average with enough samples → one alert arrives; a fairly-priced fixture → none.

### Tests for User Story 1

- [ ] T013 [P] [US1] Contract test AUTO.RIA search/info/average_price vs fixtures in `test/contract/auto-ria.spec.ts`
- [ ] T014 [P] [US1] Unit test valuation (discount, confidence gate, red-flags) in `test/unit/valuation.spec.ts`
- [ ] T015 [P] [US1] Integration test end-to-end alert path in `test/integration/alert-flow.spec.ts`

### Implementation for User Story 1

- [ ] T016 [P] [US1] AUTO.RIA adapter implementing `ListingSource` (search/info/average_price/dictionaries) in `src/modules/sources/auto-ria/`
- [ ] T017 [P] [US1] Dictionary cache (marks/models/states/cities) in `src/modules/sources/dictionary-cache.service.ts`
- [ ] T018 [US1] Listing + PriceObservation repository with unique `(source, externalId)` dedup in `src/modules/listings/`
- [ ] T019 [US1] Ingestion service: search → filter new ids → budgeted fetch details in `src/modules/listings/ingestion.service.ts`
- [ ] T020 [US1] Valuation service: fair value, discount, confidence, red-flags, opportunity + score in `src/modules/valuation/valuation.service.ts`
- [ ] T021 [US1] FairValueBenchmark cache (per cohort/day) in `src/modules/valuation/benchmark-cache.service.ts`
- [ ] T022 [US1] Telegram `Notifier` adapter + alert formatting incl. AUTO.RIA backlink in `src/modules/notifications/telegram/`
- [ ] T023 [US1] Persist Opportunity + Notification with unique `dedupKey` in `src/modules/notifications/`
- [ ] T024 [US1] Poll job + cron wiring for one profile through the rate budget in `src/modules/scheduling/poll.processor.ts`
- [ ] T025 [US1] Seed one example SearchProfile + subscriber bootstrap in `src/modules/profiles/seed.ts`

**Checkpoint**: MVP — a real below-market listing triggers a Telegram alert.

---

## Phase 4: User Story 2 - Control what I watch and how strict it is (Priority: P2)

**Goal**: Per-niche tuning (threshold, dealer policy, currency, enable/disable) changes results.

**Independent Test**: Two profiles with different thresholds/dealer policies produce different alerts; disabling a profile stops its alerts.

### Tests for User Story 2

- [ ] T026 [P] [US2] Unit test threshold + dealer policy + enable/disable filtering in `test/unit/profile-rules.spec.ts`

### Implementation for User Story 2

- [ ] T027 [P] [US2] SearchProfile config service (create/edit/list/enable) in `src/modules/profiles/profiles.service.ts`
- [ ] T028 [US2] Apply per-profile threshold, confidence min, dealer policy in ingestion/valuation in `src/modules/valuation/`
- [ ] T029 [US2] Honor enabled/disabled profile in the scheduler in `src/modules/scheduling/`
- [ ] T030 [US2] FX: `ExchangeRate` port + NBU adapter + normalization in `src/modules/fx/`
- [ ] T031 [US2] Currency switch in comparison/display in `src/modules/valuation/` + `src/modules/notifications/`

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 - Understand and trust each alert (Priority: P3)

**Goal**: Each alert explains why it was flagged and links back; suspicious discounts are flagged, not celebrated.

**Independent Test**: Trigger an alert → message contains asking, fair value, discount %, confidence (sample size), red-flags, seller type, working link.

### Tests for User Story 3

- [ ] T032 [P] [US3] Unit test alert message contains all reasoning fields + link in `test/unit/alert-format.spec.ts`

### Implementation for User Story 3

- [ ] T033 [US3] Enrich alert format (all reasoning fields + seller type + link) in `src/modules/notifications/format/`
- [ ] T034 [US3] Suspicious-discount handling (flag as risky, not jackpot) in `src/modules/valuation/red-flags.ts`
- [ ] T035 [US3] Telegram bot commands (/start, /subscribe, /unsubscribe, /mute, /profiles, /help) in `src/modules/notifications/telegram/commands/`

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T036 [P] Price-drop detection on known listings + price-drop message (FR-009) in `src/modules/listings/` + `src/modules/notifications/`
- [ ] T037 [P] Relist/duplicate heuristic (VIN / phone-hash) (FR-008) in `src/modules/listings/relist.service.ts`
- [ ] T038 Graceful degradation + operator alert on budget exhaustion / source down (FR-012) in `src/modules/scheduling/`
- [ ] T039 [P] Run `quickstart.md` validation scenarios end-to-end
- [ ] T040 [P] Update knowledge vault (`overview`, `glossary`) + repo `README`

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2, blocks all)** → **US1 (P3)** → US2 → US3 → **Polish**.
- US1 is the MVP and must be independently testable before US2/US3.
- FX (T030) is a prerequisite for currency switching (T031) but not for US1 (single-currency compare).
- Within a story: tests first (must fail), then models → services → adapters → wiring.

## Coverage (task ↔ requirement)

| Req | Tasks |
|---|---|
| FR-001 profiles | T027, T025 |
| FR-002 discover listings | T019, T024 |
| FR-003 fair value | T020, T021 |
| FR-004 discount | T020 |
| FR-005 opportunity gating | T020 |
| FR-006 red-flags | T020, T034 |
| FR-007 notify w/ reason+link | T022, T033 |
| FR-008 no duplicate / relist | T018, T023, T037 |
| FR-009 price drop | T036 |
| FR-010 per-profile config | T027, T028, T029, T031 |
| FR-011 store listings + history | T012, T018 |
| FR-012 rate budget + degrade + operator alert | T011, T024, T038 |
| FR-013 rank opportunities | T020 |
| FR-014 currency normalization | T030 |
| FR-015 subscribe/unsubscribe/mute | T035 |

## Implementation Strategy

MVP first: Setup → Foundational → US1, then STOP and validate a real alert. Add US2 (control),
then US3 (trust), then polish. Each story is a deployable increment.

## Notes

- Run all shell commands via RTK. Commit after each task or logical group.
- Tests for a story must fail before its implementation (Principle VI).
