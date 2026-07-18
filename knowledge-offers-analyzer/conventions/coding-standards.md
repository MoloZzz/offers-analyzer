---
title: Coding standards & conventions
type: convention
updated: 2026-07-17
---

# Coding standards & conventions

> Goal (agreed): **clean code — readable, simple, and extensible where it pays off.** Record a convention here the moment it's agreed; future agents follow this note, not their defaults. Grounded in reputable sources, not a random boilerplate repo: `goldbergyoni/nodebestpractices`, the official NestJS docs, and `typescript-eslint` (strict).

## Principles (the "why")

- **Readable first.** Optimize for the next reader. Clear names over cleverness; small functions that do one thing.
- **SRP / small units.** One reason to change per class/module. Thin controllers → services → repositories. Business logic never lives in controllers.
- **Simple over flexible.** Don't add abstraction until a second real case exists (YAGNI). Extensibility where the domain clearly demands it — e.g. the `ListingSource` port for multiple sites (see [[monitoring-approaches]]) — not everywhere.
- **Dependency inversion.** Depend on interfaces (ports), not concretions. External systems (AUTO.RIA API, Telegram, DB) sit behind adapters so they're swappable and testable.
- **Explicit boundaries.** Domain logic isolated from framework/IO. DTOs validated at the edge; typed everywhere (no `any`).
- **Errors are values you handle.** No silent catches; fail loud, log with context, use typed error paths.

## NestJS structure

- Feature modules (e.g. `listings`, `sources`, `valuation`, `notifications`) — each with its own controller/service/dto/entities.
- DTOs with `class-validator` + `ValidationPipe`; never trust external input (API responses, bot commands).
- Config via `@nestjs/config`; **no secrets in code** (API key, bot token → `.env`, already gitignored).
- **Schema changes go through migrations, never `synchronize`.** Migrations are **append-only
  history**: for each entity change generate a **new incremental** migration
  (`npm run migration:generate -- src/common/database/migrations/<Name>`), review it, and commit it.
  **Never delete existing migrations and regenerate** — that throws away history and breaks anyone
  who already ran them. (The only exception was the one-time initial baseline before the first real DB.)
- **Keep entity metadata == DB so `migration:generate` yields an *empty* diff** (no spurious churn). Two
  gotchas we hit and their fixes:
  - **`numeric`/`decimal` column defaults must be a raw-SQL function**: `@Column('numeric', { default: () => '0.3' })`.
    TypeORM's `normalizeDefault` **quotes both number and string** defaults to `'0.3'`, but Postgres
    constant-folds a numeric column's default and introspects it **unquoted** as `0.3`, so `default: 0.3`
    *and* `default: '0.3'` both diff forever (`'0.3' !== 0.3` → repeated `SET DEFAULT '0.3'`). Only the
    function-default branch stays unquoted (`0.3`) and matches the DB. (Verified against the installed
    TypeORM 0.3.20 `PostgresDriver.normalizeDefault` / `PostgresQueryRunner` default parsing.)
  - **Name an `@Index` explicitly when the migration named it** (e.g. `@Index('IDX_outcomes_listingId', ['listingId'])`).
    A bare `@Index(['col'])` expects TypeORM's auto-hash name; if a migration created it with a custom
    name, the differ keeps drop/re-creating the index. Prefer letting TypeORM auto-name indexes in new
    migrations so this doesn't arise.
  - If a purely-spurious churn migration was already generated (only `SET DEFAULT`/index-rename no-ops),
    fix the entity as above and **delete that one artifact migration** (it represents no real change) —
    this is not the forbidden "delete history", it's removing an erroneous regeneration before it runs.
- Async work (polling, notifications, calibration) via `@nestjs/schedule` cron — **no queue/BullMQ/Redis in v1** (see [[0004-drop-redis-bullmq|ADR-0004]]), not inline in request handlers.

## Testing

- Unit-test the logic that matters: valuation/profitability rules, dedup, budget scheduling.
- The external API is **contract-tested against fixtures** — tests must not hit the live 30/hr endpoint. Record real responses once, replay them.
- Run test/build/lint through RTK (`../.claude/RTK.md`).

## Enforcement (start pragmatic, tighten as needed)

Principles that aren't enforced by tooling rot — but keep it proportionate to a small project:

- **Now (v1):** strict `tsconfig` (`strict: true`, `noImplicitAny`), ESLint (`typescript-eslint` recommended-strict + `import/order`), Prettier. One command: `npm run lint` / `npm run format` (via RTK).
- **Light gate:** Husky + lint-staged so commits are auto-formatted/linted. Add when it stops being annoying-vs-useful.
- **Later (when contributors/CI grow):** Conventional Commits + commitlint, CI running rtk-wrapped lint/test/build, a coverage floor on core logic. Don't front-load these.

Rule of thumb: enough tooling to keep the code clean automatically, not so much it slows a one-person v1.

## Related

- [[00-INDEX]] · [[overview]] · [[environment-setup]] · [[monitoring-approaches]]
