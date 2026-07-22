---
title: ADR-0007 — Structured logging via nestjs-pino
type: decision
status: Accepted
updated: 2026-07-22
---

# ADR-0007 — Structured logging via nestjs-pino

**Status:** Accepted
**Date:** 2026-07-22

## Context

Every service used NestJS's built-in `Logger` (`new Logger(X.name)`), which prints
human-oriented text lines with values interpolated into the message string (e.g.
`` `Search failed for profile ${profile.id}` ``). That's fine to read in a terminal but
unusable for machine consumption — no way to query "all errors for profile X" or ship
logs to an aggregator with queryable fields. The user asked for structured logging.

## Decision

Adopt **`nestjs-pino`** (wraps `pino`, the standard structured logger for Node/Nest):

- `LoggerModule.forRootAsync` in `app.module.ts` configures level (`logLevel` config,
  §env `LOG_LEVEL`, default `debug` dev / `info` prod), redacts secrets
  (`autoRiaApiKey`, `telegramBotToken`), and disables `pinoHttp` autoLogging — this app
  has no meaningful HTTP surface (background poller + Telegram bot), so services log
  their own structured events instead of relying on request/response auto-logs.
- In development, `pino-pretty` renders single-line colorized output; in production,
  raw JSON (one object per line) for log aggregation.
- `main.ts` uses `bufferLogs: true` + `app.useLogger(app.get(Logger))` so bootstrap logs
  go through pino too.
- Every service previously doing `private readonly logger = new Logger(X.name)` now
  injects `PinoLogger` via `@InjectPinoLogger(X.name)` and calls
  `logger.warn({ field1, field2 }, 'Message')` — a merging object first, a static
  message second — instead of interpolating values into the string. This is what makes
  it *structured*: fields are queryable, not just embedded text.

No new infrastructure — `pino`/`pino-http` are small, dependency-free-at-runtime
libraries, consistent with the project's YAGNI stance ([[0004-drop-redis-bullmq|ADR-0004]]).

## Consequences

**Positive:** log fields (`profileId`, `sourceKey`, `err`, etc.) are queryable once
shipped anywhere; JSON in prod is aggregator-ready; `pino`'s child-logger pattern gives
each service its own `context` for free; near-zero runtime overhead vs the console
logger.

**Negative / trade-off:** every service constructor gained a `PinoLogger` param (touches
9 files); the two contract tests that construct `AutoRiaSource`/`NbuExchangeRate`
directly (`test/contract/*.spec.ts`) need a no-op `PinoLogger` stub passed in.

## Related

- [[coding-standards]] · [[overview]] · [[decisions/README]]
