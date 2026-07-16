---
title: Backlog — living execution queue
type: context
updated: 2026-07-17
---

# Backlog

The single **working queue** we pull from (step 4 of our flow: plan → stages → tasks+backlog →
execute). Ordered by priority. `tasks.md` holds the formal per-feature breakdown; this backlog
spans features, refinements, tech-debt, and deferred ideas, and points into specs where relevant.

Status: `[ ]` todo · `[~]` in progress · `[x]` done · `[blocked]`.

## 🔴 Now — correctness / unblock the running pipeline

- [ ] **B1 — Regenerate the DB migration.** The committed initial migration still has the old
  `discountThresholdPct`. Existing dev data is disposable. Delete `src/common/database/migrations/*.ts`,
  `npm run migration:generate`, `migration:run`. (Migrations-only now — see [[coding-standards]].)
- [x] **B2 — AUTO.RIA field mappings validated** against live responses. `search`/`info` fixed;
  red-flags enriched from `autoInfoBar`; `/average_price` confirmed → fair value now uses the robust
  **`interQuartileMean`** (not the outlier-skewed `arithmeticMean`), `total` = sample size. Full map in
  `contracts/auto-ria-api.md`.
- [~] **B3 — Search strategy: N+1** (`search` = ids only). `countpage=100` **done**. Freshness
  **done** via the `top` submission-period filter (see B19) — note: AUTO.RIA `order_by` has **no**
  "newest" value (only 0/1/2), so newest-first is `top`, not `order_by`. Remaining (low priority):
  budget-cursor (round-robin across profiles).
- [~] **B4 — Make the pipeline run:** now driven by `config/search-profiles.json` (copy the example,
  set numeric ids + `enabled: true`, restart). **User action** to go live.

## 🟡 Next — US2 (operator config + currency)

- [~] **B5 — SearchProfile config (operator).** Declarative `config/search-profiles.json`, upserted by
  `name` on boot, implemented. Remaining (optional, later): richer editing via bot command / API.
- [x] **B6 — FX / currency:** NBU `ExchangeRate` adapter (daily-cached, falls back to rate 1);
  comparison stays in USD (ratios are currency-agnostic), Opportunity amounts are converted to the
  profile's currency for storage/alert. Contract-tested. FR-014.
- [x] **B7 — Per-profile config applied** end-to-end: minDealScore ✅, dealer policy ✅, currency ✅
  (conversion), enable/disable ✅. (Dedicated wiring unit test still optional.)

## 🟡 Next — US3 (trust & bot)

- [x] **B8 — Telegram bot commands:** `/start`, `/stop`, `/mute`, `/profiles`, `/help`
  (`TelegramBotUpdate` + `SubscribersService` + `ProfilesService`). FR-015.
- [x] **B9 — Richer alert:** leads with the deal score, shows asking vs market, discount, confidence,
  seller, Ukrainian risk labels, and the AUTO.RIA backlink. Unit-tested. Spec 001 US3 / FR-007.
- [x] **B-bot-query — On-demand bot queries:** `/check <id|url>` evaluates a specific listing live
  (fetch → value → reply with the deal score), `/top` lists the best-scoring saved opportunities.
  `QueryService` + `QueryModule` (reuses source + valuation + listings). Lets the operator check any
  car instantly instead of waiting for the poll.

## 🔵 Business-value push (2026-07-16) — reach non-zero opportunities

Root cause + plan in [[why-no-opportunities]].

- [x] **B18 — Widen the cohort + surface candidates.** `valuation/cohort.ts`
  (`cohortCandidates` → make+model+year±1, then make+model; `resolveBenchmark` widens until
  `sampleSize ≥ 10`), used by poll + `/check`. Default `minDealScore` lowered **0.3 → 0.15**. New bot
  command **`/best`** lists best-scoring evaluated listings even below the alert bar
  (`QueryService.topCandidates` → `ListingsService.topByScore`). No schema change.
- [x] **B19 — Newest by market.** `submittedWithin` query knob → AUTO.RIA `top` submission-period
  filter; a profile with **empty `makeModelPairs`** + region + `priceTo` + `submittedWithin` ingests the
  freshest listings market-wide, each valued against its own widened cohort. Example profile shipped
  **disabled** (budget-heavier — operator opts in). No schema change (`filters` is jsonb).

## 🔵 Valuation refinements (2026-07-17) — accuracy: mileage + condition

Broken into steps per the operator's ask ("обидва підходи, покроково"). Mileage (M), condition (C),
self-tuning reports (R).

- [x] **M1 — Mileage-banded cohort.** `cohort.ts`: `cohortCandidates` now tries
  **make+model+year±1+mileage±25k km** first (a like-for-like average), then year±1, then make+model;
  `resolveBenchmark` widens as before. Cache keys already include mileage. Unit-tested
  (`test/unit/cohort.spec.ts`). No schema change.
- [ ] **M2 — Analytic mileage correction.** When we fall back off the banded cohort (mileage-agnostic
  average), adjust `fairValue` by expected-mileage-for-age × per-1000km factor. Needs `resolveBenchmark`
  to report whether the matched cohort was mileage-aware; add config (annual-km, price-per-1000km) with
  a cap. Guard confidence.
- [ ] **M3 — Show mileage context** in the alert/`/check` (e.g. "пробіг 120к vs очікувано 90к → −$800").
- [ ] **C1 — Read description.** Add `description?: string` to `ListingDetail` from `/info`
  `autoData.description` (confirmed present; free text, ru/uk).
- [ ] **C2 — Condition red-flags.** Keyword scan of the description (uk+ru) → new flags: after-accident,
  needs-repair, engine/gearbox issue, non-runner (disqualifying/soft). Negatives penalise; positive
  phrases ("ідеальний стан", "не бита не фарбована") do **not** inflate score (anti-gaming).
- [ ] **C3 — Wire condition** into `ValuationInput`/`evaluate` + Ukrainian labels in the alert.
- [ ] **R1 — Self-tuning report (scheduled).** Weekly digest from stored evaluations +
  `average_price_snapshots`: #evaluated, score distribution, near-misses just below threshold, suggested
  `minDealScore`. Turns practice into recommendations. Deferred until some data accumulates.

## 🟢 Later — deferred (promote when picked up)

- [x] **B10 — Price-drop detection (FR-009):** after new ids, the poll re-observes up to
  `REOBSERVE_PER_CYCLE` known listings (oldest `lastSeenAt` first), budget-permitting; on a price drop
  that re-qualifies as an opportunity it sends a distinct `📉 Ціна знижена` alert (idempotent
  `price_drop` dedupKey). `ListingsService.findByExternalIds` + `NotificationsService.notifyPriceDrop`.
- [ ] **B11 — Own-statistics valuation** — mostly **obviated**: RIA `/average_price` already returns
  `interQuartileMean` + `percentiles` (robust) for free, which we now use. Only worth revisiting if we
  need stats RIA doesn't give (e.g. our own regional/trim cuts). See [[profitability-definition]].
- [ ] **B12 — Relist/duplicate heuristic** (VIN / phone-hash). FR-008.
- [x] **B13 — Durable rate budget:** Postgres-backed `rate_budget_windows` (atomic upsert per hour
  window, prunes old windows). Survives restarts + safe across instances; 429 still authoritative. Redis
  not needed. See [[0004-drop-redis-bullmq|ADR-0004]].
- [ ] **B14 — Dictionary cache** (id↔name) if a flow needs name→id resolution. (T017)
- [ ] **B15 — Integration test** end-to-end alert path with a DB harness. (T015)
- [ ] **B16 — Operator alerting** on budget exhaustion / source down (dead-man's-switch). (FR-012 / T038)
- [ ] **B17 — Scale:** paid API tier / wider coverage; explore [[alternative-sources]] if the API
  stays too limiting.

## Related
- [[00-INDEX]] · [[goals]] · [[monitoring-approaches]] · [[profitability-definition]]
