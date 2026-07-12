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

Planned in [[specs/README|spec 001]] `plan.md` (not yet implemented). One NestJS module per concern:

| Module | Responsibility | Notes |
|--------|----------------|-------|
| `sources` | `ListingSource` port + AUTO.RIA adapter + dictionary cache | first adapter; see [[monitoring-approaches]] |
| `listings` | Listing & PriceObservation entities, dedup/relist | history from day one |
| `valuation` | fair value, discount, confidence, red-flags, opportunity scoring | see [[profitability-definition]] |
| `profiles` | SearchProfile config (niche + tuning) | user-controlled params |
| `notifications` | Telegram bot, Subscriber, Notification, formatting | `Notifier` port |
| `scheduling` | cron + BullMQ queues + rate budget (token bucket) | enforces ~30 req/hr |
| `fx` | `ExchangeRate` port + NBU adapter | UAH/USD normalization |

## Data flow

Planned end-to-end path (v1): `scheduling` cron enqueues a poll per active `profile` →
`sources` search (ids) → `listings` filters to new ids → `sources` fetch details (budgeted) →
`valuation` gets `sources` average price, computes discount/confidence/red-flags → an
**Opportunity** is stored → `notifications` sends a Telegram alert with the AUTO.RIA backlink.
Full design: `specs/001-profitable-listing-alerts/` (plan, data-model, contracts, quickstart).

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
