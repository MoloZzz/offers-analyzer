# Implementation Plan: Telegram monitoring control

**Spec**: [spec.md](spec.md) | **Created**: 2026-08-02 | **Status**: Ready

## Design

Add a small Postgres-backed source-control entity/service under `scheduling`. The existing
`RateBudgetService` checks that service around daily cutoff/exhaustion and tier admission while
retaining monthly-pool enforcement. Telegram receives the scheduling service plus typed admin chat
IDs from configuration. Commands are admin-only and default to the single supported source key
`auto-ria`.

## Files

- `src/modules/scheduling/entities/source-control.entity.ts`
- `src/modules/scheduling/source-control.service.ts`
- `src/modules/scheduling/rate-budget.service.ts`
- `src/modules/scheduling/scheduling.module.ts`
- `src/modules/notifications/telegram/telegram-bot.update.ts`
- `src/common/config/configuration.ts`, `.env.example`
- new TypeORM migration
- unit tests for source control, rate budget, and Telegram commands

## Safety

- No source adapter bypasses `RateBudgetService` or the monthly pool.
- Empty admin configuration denies access to the new commands.
- Existing budget accounting and profile enablement remain intact.
- A pause is durable; it is not reset by an app restart.
