---
title: Architecture overview
type: architecture
updated: 2026-07-12
---

# Architecture overview

> Living map of the Offers Analyzer system: modules, data flow, and boundaries. Keep in sync with the code (see [[vault-protocol]]).

## Stack

- **Runtime/Framework:** Node.js + NestJS.
- **DB / ORM:** PostgreSQL + TypeORM.
- **Queue/scheduling:** Redis + BullMQ (rate-limited polling under the API budget).
- **Notifications:** Telegram bot.
- **Repository:** `MoloZzz/offers-analyzer` (GitHub).

## Module map

_TODO: fill as modules land. One row per module._

| Module | Responsibility | Key files | Notes |
|--------|----------------|-----------|-------|
| _(none yet)_ | — | — | Bootstrap stage |

## Data flow

_TODO: describe how an offer enters the system, is analyzed, and is stored/returned. Add a diagram when the first end-to-end path exists._

## Entities / data model

_Draft — refine during `/speckit-plan`:_
- **SearchProfile** — a configured niche to watch (region + make/models + price band).
- **Listing** — a car listing (auto_id, specs, seller, current price) fetched via the source adapter.
- **PriceObservation** — price of a listing at a point in time (history, drop detection).
- **Opportunity** — a flagged candidate deal (fair value, discount, score, red-flags). See [[profitability-definition]].
- **Subscriber / Notification** — Telegram users and what's been sent (idempotent).

## Boundaries & integrations

- **AUTO.RIA official API** behind a `ListingSource` port (first adapter). See [[monitoring-approaches]] and [[0002-monitoring-via-official-api|ADR-0002]].
- **Telegram Bot API** for push notifications.
- **Redis** for the queue/rate-limited scheduler.
- Future: additional listing sources implement the same port.

## Related

- [[00-INDEX]]
- [[glossary]]
- [[decisions/README]]
