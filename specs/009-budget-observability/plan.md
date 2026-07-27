# Implementation Plan: Budget Observability and Rollout Guardrails

**Spec**: [spec.md](spec.md) | **Created**: 2026-07-28 | **Status**: Ready

## Summary

Add an immutable monthly budget-activity ledger beside the existing enforcement aggregate. Extend
source calls with narrow attribution metadata, record every allow/deny, derive a pure budget
digest from ledger plus `MonthlyBudgetState`, and present it through a no-source-call `/budget`
Telegram command. The report compares actual and run-rate operation spend to ADR-0009 and exposes
the SPEC-005/additional-profile rollout gate.

## Technical Context

- **Language/Version**: TypeScript / Node.js (NestJS)
- **Storage**: PostgreSQL / TypeORM; new append-only `budget_activities` table
- **Testing**: Jest unit tests; existing adapter/poll tests updated for attribution
- **Constraint**: Existing monthly-state admission algorithm stays authoritative and behavior
  compatible; audit writes are additive and require no source call.

## Constitution Check

- **I Spec-driven**: spec, plan, data model, contracts and tasks precede implementation.
- **II Knowledge base**: vault/spec index/session log are updated with the durable operations model.
- **III Simple code**: one small ledger entity and service-owned report projection; no dashboard.
- **IV Ports/adapters**: request context is optional metadata on the existing source port.
- **V Limits**: report makes zero AUTO.RIA calls; admission and 429 pacing are unchanged.
- **VI Testing**: pure projection and rate-budget service behavior are unit tested.

## Data Model

See [data-model.md](data-model.md). `BudgetActivity` records one attempted unit of source budget;
the aggregate monthly state remains the fast enforcement counter.

## File Structure

```text
src/modules/scheduling/
  entities/budget-activity.entity.ts
  budget-report.ts
  rate-budget.service.ts
src/modules/sources/
  ports/listing-source.port.ts
  auto-ria/auto-ria.source.ts
src/modules/query/
  query.service.ts
  query.module.ts
src/modules/notifications/
  telegram/telegram-bot.update.ts
test/unit/
  budget-report.spec.ts
  rate-budget.spec.ts
```

## Design Decisions

1. `BudgetRequestContext` travels from poll/sweep/query work to the source adapter, then to
   `RateBudgetService`; profile id/name are optional to represent shared operations faithfully.
2. A denial is recorded by the budget service at the same decision point as the existing log.
   Successful use increments the existing aggregate before recording its audit event.
3. The report treats legacy aggregate use without ledger events as a visible reconciliation gap;
   it does not invent attribution or alter counters.
4. Readiness requires ledger evidence in the current month, reconciliation, and a forecast not
   exceeding the pool. Human approval remains outside this feature.
