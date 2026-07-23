# Tasks: Post-Deal Outcomes (realized margin)

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Status: `[ ]` todo · `[~]` in progress · `[x]` done. `[P]` = parallelizable.

## Phase A — US7.1–7.2 (this implementation)

- [ ] T001 [US7.1] `DealOutcome` entity (`src/modules/calibration/entities/deal-outcome.entity.ts`)
      — table `deal_outcomes`, `@Unique('UQ_deal_outcomes_listingId')`,
      `@Index('IDX_deal_outcomes_stage')`; exports `DealStage`, `DeclineReason`,
      `DECLINE_REASONS`, `DEAL_STAGES`.
- [ ] T002 [US7.1] Wire `DealOutcome` into `ENTITIES` (`data-source.ts`) and
      `TypeOrmModule.forFeature` (`calibration.module.ts`).
- [ ] T003 [US7.1] `npm run migration:generate` → migration (raw SQL, symmetric down);
      `migration:run` on dev DB; re-generate → **no churn**.
- [ ] T004 [P] [US7.2] Pure `src/modules/calibration/deal-margin.ts`: `realizedMargin`,
      `realizedDom`, `deriveStage` (monotonic), `marginStats(deals)` →
      `{closed, medianMarginUsd, lossShare, medianDom}`.
- [ ] T005 [P] [US7.1] Pure `src/modules/notifications/telegram/deal-callback.ts`
      (mirror `outcome-callback.ts`): `DEAL_PREFIX='dl'`, `buildDealCallback`,
      `buildDeclineReasonCallback`, `parseDealCallback`.
- [ ] T006 [P] [US7.1] Pure `src/modules/notifications/telegram/deal-args.ts`:
      `parseDealArgs(arg)` → `{patch, error?}` (key=value tokens, validation, note remainder).
- [ ] T007 [P] Tests: `deal-margin.spec.ts`, `deal-callback.spec.ts` (incl. 64-byte assertion),
      `deal-args.spec.ts`.
- [ ] T008 [US7.1] `DealsService` (`src/modules/calibration/deals.service.ts`):
      `upsertForListing`, `markBought`, `markDeclined`, `openDeals`, `closedDeals`,
      `recent`, `dueForReminder`, `markReminded`; provided + exported by `CalibrationModule`.
- [ ] T009 [US7.1] `test/unit/deals-service.spec.ts` — fake-repo (idempotent upsert, stage never
      downgrades, boughtAt/soldAt set once, reminder due-logic, closedDeals excludes incomplete).
- [ ] T010 [US7.1] Alert button row: `notifications.service.ts` appends
      `🛒 Купив` / `❌ Відмова` in `notifyOpportunity` + `notifyPriceDrop`.
- [ ] T011 [US7.1] Bot: `telegram-bot.update.ts` — inject `DealsService`; `@Action(/^dl:/)`
      (bought / decline → reason keyboard / reason record); `/deal`, `/deals` commands;
      HELP lines; pure `format/deals-message.ts`.
- [ ] T012 [P] [US7.2] `report.ts`: digest `realizedDeals` block + `formatReport` line;
      `query.service.ts` `report()` calls `deals.closedDeals()` + `marginStats`.
- [ ] T013 [US7.2] Extend `test/unit/report.spec.ts` for the realized-deals digest/line.
- [ ] T014 [US7.1] Config `dealReminderDays` (`DEAL_REMINDER_DAYS`, default 30) in
      `configuration.ts` + `.env.example`.
- [ ] T015 [US7.1] `DealReminderService` (`deal-reminder.service.ts`, daily `@Cron`) + register
      in `NotificationsModule` + unit test (fake deals/notifications).
- [ ] T016 Verification: `rtk tsc` clean, `rtk npm test` green, migration no-churn.
- [ ] T017 Vault sync: backlog, `knowledge-offers-analyzer/specs/README.md`,
      `architecture/overview.md`, `domain/glossary.md`, session log.

## Phase B — US7.3 (later, CHANGE-002.1) — tasks at pickup

_Re-target spec 002 tuning to `median(realized margin)` + loss-making share; threshold frozen
until ≥15 closed deals._

## Phase C — US7.4 (later) — tasks at pickup

_`Z_forecast` vs `Z_actual` on closed deals once SPEC-006 (`Z`) ships._
