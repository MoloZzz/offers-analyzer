---
title: Project goals & scope (living)
type: context
updated: 2026-07-13
---

# Project goals & scope

> Living document. Captures the "why" and the current scope so any agent has the goal without re-reading the whole chat. Durable decisions get promoted to ADRs; this stays the plain-language north star.

## Vision

Build a system that **monitors car listings on auto.ria.com** (with room for other similar sites later) and **surfaces offers that are profitable/advantageous** — i.e. priced meaningfully below fair market value with low risk.

## v1 scope (decided so far)

- **Source:** AUTO.RIA official API only, no scraping ([[0002-monitoring-via-official-api|ADR-0002]]).
- **Coverage:** a **narrow niche** (a few search profiles) on the free API tier (~30 req/hour).
- **Profitability:** "below fair value + threshold + risk red-flags", anchored on RIA average price — see [[profitability-definition]] *(still Proposed)*.
- **Delivery:** Telegram bot notifications.
- **Stack:** NestJS · PostgreSQL · TypeORM · `@nestjs/schedule` cron + in-memory rate budget · Telegram bot. (No Redis/BullMQ in v1 — see [[0004-drop-redis-bullmq|ADR-0004]].)
- **Method:** strict Spec-Driven Development; clean code per [[coding-standards]].

## Explicitly later (not v1)

- Widening beyond the niche (needs a paid API package).
- Scraping fallback (only behind the source-adapter port, for a genuinely missing field).
- True resale-margin profitability model (needs accumulated data on how flagged cars sell).
- Additional listing sources.

## The 4 questions — resolved as **configuration** (user-controlled)

Decision (2026-07-12): none of these are hardcoded into v1. They are parameters the user
controls, so no upfront commitment is needed:

1. **Niche** → a **SearchProfile** config (region + make/models + price band). v1 ships the
   mechanism; the user adds concrete profiles later. Niche choice deferred, not blocking.
2. **Discount threshold** → config value per profile (suggested default 15–20%).
3. **Dealers** → config policy per profile: `label` | `exclude` | `ignore-distinction`.
4. **Currency** → configurable with switching; prices normalized via a stored FX rate.

Remaining true unknown: the profitability *methodology* must be crystal-clear before the
first spec — see [[profitability-definition]] (worked example added).

## Related (curated)

- [[00-INDEX]] · [[monitoring-approaches]] · [[profitability-definition]] · [[overview]]
