---
title: Architecture overview
type: architecture
updated: 2026-07-19
---

# Architecture overview

> Living map of the Offers Analyzer system: modules, data flow, and boundaries. Keep in sync with the code (see [[vault-protocol]]).

## Stack

- **Runtime/Framework:** Node.js + NestJS.
- **DB / ORM:** PostgreSQL + TypeORM.
- **Scheduling:** `@nestjs/schedule` cron with an in-memory rate budget (no Redis — see [[0004-drop-redis-bullmq|ADR-0004]]).
- **Notifications:** Telegram bot.
- **Repository:** `MoloZzz/offers-analyzer` (GitHub).

## Module map

Implemented (spec 001). One NestJS module per concern:

| Module | Responsibility | Notes |
|--------|----------------|-------|
| `sources` | `ListingSource` port + AUTO.RIA adapter + dictionary cache | first adapter; see [[monitoring-approaches]] |
| `listings` | Listing & PriceObservation entities, dedup/relist, `topByScore` | history from day one |
| `valuation` | fair value, discount, confidence, red-flags, scoring; `cohort.ts` widen-and-retry; **composite score** `priceCore × Π(factor modifiers)` (`factors/`, spec 003 — liquidity + repair-risk shipped; negotiation/seller/positives/segment-mileage pending); tunables from the active `ParameterSet` | see [[profitability-definition]], [[profitability-methods-coverage]], [[why-no-opportunities]] |
| `calibration` | versioned `ParameterSet` + `ParametersService` (candidate/activate); `Outcome` + `OutcomesService`; `CalibrationService` (threshold auto-calibration + weight learning) + `CalibrationRun`; `threshold-calibration.ts`/`weight-learning.ts` | spec 002; [[0005-versioned-parameter-sets\|ADR-0005]] |
| `profiles` | SearchProfile config (niche + tuning; empty make/model = market-wide) | user-controlled params |
| `query` | read-mostly on-demand queries for the bot (`assessById`, `topOpportunities`, `topCandidates`, `report`) | powers `/check`, `/top`, `/best`, `/report`, `/why`, `/outcome` |
| `notifications` | Telegram bot, Subscriber, Notification, formatting, weekly report + calibration schedulers, **health monitor** (dead-man's-switch) | `Notifier` port |
| `health` | `HealthService` (shared liveness singleton) + pure `decideHealthAlert`; poll marks success/failure, monitor alerts the operator | dead-man's-switch |
| `scheduling` | Postgres-backed rate budget (durable fixed window) | enforces ~30 req/hr; survives restarts |
| `polling` | cron pipeline: search all profiles → round-robin value new → re-observe price drops | budget-fair; no queue in v1 |
| `fx` | `ExchangeRate` port + NBU adapter | UAH/USD normalization |

## Data flow

End-to-end path (v1): `scheduling` cron runs a poll per active `profile` → `sources` search (ids;
market-wide profiles set `top` submission-period for "newest by market") → `listings` filters to new
ids → `sources` fetch details (budgeted) → `valuation` resolves a benchmark via **`cohort.ts`
widen-and-retry** (make+model+year±1 → make+model until `sampleSize ≥ 10`), computes
discount/confidence/red-flags → every evaluated listing records its score; an **Opportunity**
(score ≥ threshold) is stored → `notifications` sends a Telegram alert with the AUTO.RIA backlink.
The poll also re-observes a few known listings each cycle for price drops. On demand, the `query`
module lets the bot check any listing (`/check`), list stored opportunities (`/top`), or list the
best-scoring candidates even below the alert bar (`/best`). Full design:
`specs/001-profitable-listing-alerts/` (plan, data-model, contracts, quickstart).

## Entities / data model

- **SearchProfile** — a configured niche to watch (region + make/models + price band + `minDealScore`).
- **Listing** — a car listing (auto_id, specs, seller, current price, latest description snapshot, `profileId` = the niche that last evaluated it) fetched via the source adapter.
- **PriceObservation** — price of a listing at a point in time (history, drop detection).
- **Opportunity** — a flagged candidate deal (fair value, discount, score, red-flags). See [[profitability-definition]].
- **Subscriber / Notification** — Telegram users and what's been sent (idempotent).
- **FairValueBenchmark / AveragePriceSnapshot** — cached cohort average (latest) + its time-series.
- **RateBudgetWindow** — durable per-hour request-budget counter (scheduling).
- **ParameterSet** — versioned, active scoring tunables (scale, penalty, mileage factors); v1 = seeded from config. Spec 002 / [[0005-versioned-parameter-sets|ADR-0005]].
- **Outcome** — realized result of a listing (manual 👍/👎, bought/skipped/resold; passive price_dropped/disappeared). Feedback ground truth.
- **CalibrationRun** — a recorded calibration pass (per-profile inputs, proposal, applied?, reason).
- **AlertedCar** — per-car (VIN) record of the lowest price we've alerted, so a relist is only re-alerted when cheaper (B12; [[when-to-alert]]).

## Boundaries & integrations

- **AUTO.RIA official API** behind a `ListingSource` port (first adapter). See [[monitoring-approaches]] and [[0002-monitoring-via-official-api|ADR-0002]].
- **Telegram Bot API** for push notifications.
- Future: additional listing sources implement the same port.

## Related

- [[00-INDEX]]
- [[glossary]]
- [[decisions/README]]
