---
title: Architecture overview
type: architecture
updated: 2026-07-28
---

# Architecture overview

> Living map of the Offers Analyzer system: modules, data flow, and boundaries. Keep in sync with the code (see [[vault-protocol]]).

## Stack

- **Runtime/Framework:** Node.js + NestJS.
- **DB / ORM:** PostgreSQL + TypeORM.
- **Scheduling:** `@nestjs/schedule` cron with a Postgres-backed monthly pool, daily sub-budget, and priority queue (no Redis — see [[0004-drop-redis-bullmq|ADR-0004]] and [[0009-monthly-rate-limit-pool|ADR-0009]]).
- **Notifications:** Telegram bot.
- **Logging:** `nestjs-pino` — structured (JSON in prod, pretty in dev), per-service `PinoLogger` injection. See [[0007-structured-logging-nestjs-pino|ADR-0007]].
- **Error handling:** global `AllExceptionsFilter` (`APP_FILTER`) catches everything Nest's pipeline sees (all Telegram command/action handlers via `nestjs-telegraf`), logs structured + replies gracefully; every cron job (`poll`, `weekly-calibration`, `weekly-report`, `health-monitor`) catches and logs its own failures rather than crashing; `main.ts` has last-resort `uncaughtException`/`unhandledRejection` handlers that log fatal and exit (needs a restart supervisor — see [[environment-setup]]). See [[0008-global-error-handling|ADR-0008]].
- **Repository:** `MoloZzz/offers-analyzer` (GitHub).

## Module map

Implemented (spec 001). One NestJS module per concern:

| Module | Responsibility | Notes |
|--------|----------------|-------|
| `sources` | `ListingSource` port + AUTO.RIA adapter + dictionary cache | first adapter; see [[monitoring-approaches]] |
| `listings` | Listing & PriceObservation entities, dedup/relist, `topByScore`; **disappearance tracking** (spec 004): pure `disappearance.ts` (eligibility/coverage/grace/relist decisions) + `DisappearancesService` (`processCycle` id-diff → `ListingDisappearance` events, `checkRelist`) — zero API cost, no source dependency | history from day one |
| `valuation` | fair value, discount, confidence, red-flags, scoring; `cohort.ts` widen-and-retry; **composite score** `priceCore × Π(factor modifiers)` (`factors/`, spec 003 — liquidity + repair-risk implemented in code but **intentionally inactive in prod** per [[0010-defer-factor-activation-until-k|ADR-0010]]: activation deferred until SPEC-004's `k` lands, then one combined ParameterSet change + single threshold re-validation (spec 004 Phase C); until then `score === priceCore`; negotiation/seller/positives/segment-mileage pending) | see [[profitability-definition]], [[profitability-methods-coverage]], [[why-no-opportunities]] |
| `calibration` | versioned `ParameterSet` + `ParametersService` (candidate/activate); `Outcome` + `OutcomesService`; `CalibrationService` (threshold auto-calibration + weight learning) + `CalibrationRun`; `threshold-calibration.ts`/`weight-learning.ts`; **`DealOutcome` + `DealsService`** (spec 007: stateful post-deal record) + pure `deal-margin.ts` (realized margin/DOM, monotonic stage) | spec 002 + 007; [[0005-versioned-parameter-sets|ADR-0005]] |
| `profiles` | SearchProfile config (niche + tuning; empty make/model = market-wide) | user-controlled params |
| `query` | read-mostly on-demand queries for the bot (`assessById`, `topOpportunities`, `topCandidates`, `report`, `dealsOverview`) | powers `/check`, `/top`, `/best`, `/report`, `/why`, `/outcome`, `/deal`, `/deals` |
| `notifications` | Telegram bot, Subscriber, Notification, formatting, weekly report + calibration schedulers, **health monitor** (dead-man's-switch); **deal-outcome buttons** (🛒/❌) + `/deal`/`/deals` + `DealReminderService` (daily nudge to close bought-but-unsold deals, spec 007) | `Notifier` port |
| `health` | `HealthService` (shared liveness singleton) + pure `decideHealthAlert`; poll marks success/failure, monitor alerts the operator | dead-man's-switch |
| `scheduling` | Postgres-backed monthly pool, daily sub-budget calculator, priority queue, and immutable `BudgetActivity` audit ledger | enforces the monthly cap with tiered spending; `/budget` reconciles actual and deferred work by operation/profile/tier without source calls (SPEC-009) |
| `polling` | cron pipeline: search profiles → fresh-listing value work plus bounded recovery of never-scored listings; **`SweepService`** (spec 004 US4.1b): daily 03:30 paged ids-only crawl of `filters.sweep` profiles → complete-sweep disappearance detection (30h grace) | scored-listing lifecycle rechecks are paused (SPEC-005); monthly pool + daily sub-budget; sweep ≈5,400 req/mo |
| `fx` | `ExchangeRate` port + NBU adapter | UAH/USD normalization |

## Data flow

End-to-end path (v1): `scheduling` cron runs a poll per active `profile` → `sources` search (ids;
market-wide profiles set `top` submission-period for "newest by market") → `listings` filters to new
ids → `sources` fetch details (budgeted) → `valuation` resolves a benchmark via **`cohort.ts`
widen-and-retry** (make+model+year±1 → make+model until `sampleSize ≥ 10`), computes
discount/confidence/red-flags → every evaluated listing records its score plus a persisted
**EvaluationExplanation** snapshot (`ParameterSet` version, profile threshold, cohort provenance,
fair-value base/adjustment, score breakdown, fired flags); an **Opportunity** (score ≥ threshold)
copies that same snapshot and is stored → `notifications` sends a Telegram alert with the AUTO.RIA backlink.
The poll only recovers a bounded number of never-scored listings while SPEC-005 is paused; it does
not routinely re-observe scored listings for price drops. On demand, the `query`
module lets the bot check any listing (`/check`), list stored opportunities (`/top`), or list the
best-scoring candidates even below the alert bar (`/best`). Full design:
`specs/001-profitable-listing-alerts/` (plan, data-model, contracts, quickstart).

**Valuation guard** (SPEC-011, 2026-07-29): the AUTO.RIA adapter uses percentile-50 (median) as
the fair-value base before compatibility fallbacks. An analytical uplift for claimed low mileage
requires AUTO.RIA VIN evidence and is capped at 5% once a car is 15 years old; this adds no API
calls beyond one post-deployment refresh per active cohort and protects the reusable-cohort hot path ([[0014-conservative-benchmark-and-mileage-guard|ADR-0014]]).

**Disappearance detection** (spec 004, 2026-07-23): after Phase 1 of each poll, every sighted id
bulk-bumps `Listing.lastSeenInSearchAt`; active listings absent > 24h that a *detection-eligible*
profile (no `submittedWithin`, untruncated result — via free `SourceSearchResult.total`) still
covers become `ListingDisappearance` events (cohort key, last USD price, DOM, price-cut stats)
and flip to `status='removed'`; a reappearance resurrects the listing and voids the event; new
listings are checked against recent events for relists (VIN or attribute match). Feeds the
survivorship correction `k` (spec 004 US4.3–4.4, pending). Zero extra API requests — structural
(no source dep in `DisappearancesService`). For market-wide niches beyond one 100-id page, a
**sweep profile** (`filters.sweep: true`, excluded from the 10-min poll) is instead crawled
fully once daily by `SweepService` (paged, ids-only, budget-gated, ~5,400 req/mo for the
~17.9k-listing Kyiv ≤$15k niche); only a *complete* crawl runs detection, with a 30h grace so a
single missed sweep never fabricates an event.

## Entities / data model

- **SearchProfile** — a configured niche to watch (region + make/models + price band + `minDealScore`).
- **Listing** — a car listing (auto_id, specs, seller, current price, latest description snapshot,
  `profileId` = the niche that last evaluated it, `lastExplanation` = latest persisted evaluation
  provenance) fetched via the source adapter.
- **PriceObservation** — price of a listing at a point in time (history, drop detection).
- **Opportunity** — a flagged candidate deal (fair value, discount, score, red-flags) with a copied
  `explanation` snapshot so historical alerts remain reproducible even if the listing later changes
  or disappears. See [[profitability-definition]].
- **Subscriber / Notification** — Telegram users and what's been sent (idempotent).
- **FairValueBenchmark / AveragePriceSnapshot** — cached cohort average (latest) + its time-series.
- **RateBudgetWindow** — durable request-budget ledger used by the monthly pool / daily sub-budget accounting.
- **BudgetActivity** — immutable allowed/denied monthly-pool admission attempt with operation,
  profile (when applicable), priority tier, cost, and reason; the audit input to `/budget` and
  SPEC-005's rollout guardrail (SPEC-009).
- **ParameterSet** — versioned, active scoring tunables (scale, penalty, mileage factors); v1 = seeded from config. Spec 002 / [[0005-versioned-parameter-sets|ADR-0005]].
- **Outcome** — realized result of a listing (manual 👍/👎, bought/skipped/resold; passive price_dropped/disappeared). Feedback ground truth.
- **DealOutcome** — stateful post-deal economics (spec 007): one row per listing (`stage` declined/bought/sold, decline reason, buy/costs/sell USD, realized DOM); realized margin = `sell − buy − costs`. Separate from Outcome; the future auto-tuning target (US7.3).
- **CalibrationRun** — a recorded calibration pass (per-profile inputs, proposal, applied?, reason).
- **AlertedCar** — per-car (VIN) record of the lowest price we've alerted, so a relist is only re-alerted when cheaper (B12; [[when-to-alert]]).
- **ListingDisappearance** — one event per listing that left the market (cohort key, last known USD price, DOM, price-cut stats, `is_relist`, `reappeared_at` voiding, `detection_mode` live/backfill) — the raw material for the survivorship correction `k` (spec 004).
- **Re-check schedule** *(planned, spec 005)* — an active listing's derived urgency tier and next due time; it enables direct detail re-checks independent of paginated search results. Production enablement requires the SPEC-009 evidence gate and operator approval.

## Boundaries & integrations

- **AUTO.RIA official API** behind a `ListingSource` port (first adapter). See [[monitoring-approaches]] and [[0002-monitoring-via-official-api|ADR-0002]].
- **Telegram Bot API** for push notifications.
- Future: additional listing sources implement the same port.

## Related

- [[00-INDEX]]
- [[glossary]]
- [[decisions/README]]
