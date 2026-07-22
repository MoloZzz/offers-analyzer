---
title: ADR-0008 — Global error handling
type: decision
status: Accepted
updated: 2026-07-22
---

# ADR-0008 — Global error handling

**Status:** Accepted
**Date:** 2026-07-22

## Context

The app is a single-process background service: no HTTP controllers, only a Telegram bot
(`nestjs-telegraf`) and four `@nestjs/schedule` cron jobs (poll, weekly calibration, weekly
report, health monitor). Error handling had grown ad-hoc:

- Only `/check` and `/why` wrapped their bot handlers in `try/catch`; every other command
  (`/profiles`, `/top`, `/best`, `/report`, `/calibrate`, `/params`, `/revert`, `/weights`,
  `/weights_apply`, `/outcome`, `/blacklist*`, the outcome-button action) had none. An
  unexpected throw (a DB blip, a malformed callback) would propagate out of the handler
  uncaught.
- Of the four cron jobs, only `poll.service.ts` caught its own failures (and reported them to
  `HealthService`); `calibration-scheduler`, `report-scheduler`, and `health-monitor` had no
  `try/catch` at all — a thrown error there went unlogged and the job would simply not run
  again cleanly.
- No process-level `uncaughtException`/`unhandledRejection` handlers existed — a stray
  unawaited promise anywhere had no defined behavior.

This violates the constitution's "errors are values you handle... fail loud, log with
context" principle ([[coding-standards]]) and risks a single bad Telegram update or cron
tick taking down the whole bot silently.

## Decision

Three layers, no new dependencies:

1. **Global exception filter** (`src/common/filters/all-exceptions.filter.ts`), `@Catch()`
   everything, registered as `APP_FILTER` in `app.module.ts`. `nestjs-telegraf` runs bot
   handlers through Nest's standard exception-filter pipeline, so this one filter now wraps
   every command/action handler without touching each one individually. It logs the error
   via `PinoLogger` (structured, per [[0007-structured-logging-nestjs-pino|ADR-0007]]) and,
   for the `telegraf` context type, best-effort replies to the user in Ukrainian instead of
   leaving them hanging. No HTTP branch — there are no controllers to serve.
2. **Cron job `try/catch`**, added to the three previously-unguarded jobs, mirroring the
   pattern already used in `poll.service.ts`: catch, log via the service's own
   `PinoLogger`, don't rethrow (the next scheduled tick will simply try again).
3. **Process-level safety net** in `main.ts` — `uncaughtException` and `unhandledRejection`
   handlers that log fatal (via the same `nestjs-pino` `Logger` instance used for
   `app.useLogger`) and `process.exit(1)`. Deliberately not "log and continue": Node's own
   guidance is that continuing after an uncaught exception risks corrupted state. This makes
   the process's crash **visible and logged** instead of a silent hang or an unformatted
   stack dump — but it requires a supervisor to restart the process (see
   [[environment-setup]]).

## Consequences

**Positive:** one bad Telegram update or DB blip no longer silently or fatally breaks a
handler/cron job; every unhandled error is now logged with structured context
(`{ err }`) instead of some paths going unlogged. Bot commands that previously had no
error handling now degrade gracefully with a user-facing message.

**Negative / trade-off:** `process.exit(1)` on uncaught exceptions is a no-op safety
improvement unless the deployment runs under a process supervisor with an auto-restart
policy — this is now a **requirement**, not just a nice-to-have (flagged in
[[environment-setup]]). The filter can only catch what Nest's pipeline sees (Telegraf
updates via `nestjs-telegraf`); a callback registered directly on the raw `telegraf`
`Bot` instance (bypassing Nest) would not be covered — not currently done anywhere in
the codebase.

## Related

- [[coding-standards]] · [[overview]] · [[0007-structured-logging-nestjs-pino|ADR-0007]] · [[decisions/README]]
