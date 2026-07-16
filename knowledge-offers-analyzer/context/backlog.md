---
title: Backlog — living execution queue
type: context
updated: 2026-07-13
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
- [~] **B3 — Search strategy: N+1** (`search` = ids only). `countpage=100` **done**. Remaining
  (low priority for a narrow niche): budget-cursor (round-robin across profiles), newest-first ordering
  (needs the `order_by` value verified).
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

## 🟢 Later — deferred (promote when picked up)

- [ ] **B10 — Re-observe known listings** → price-drop detection (FR-009). Competes for the budget.
- [ ] **B11 — Own-statistics valuation** — mostly **obviated**: RIA `/average_price` already returns
  `interQuartileMean` + `percentiles` (robust) for free, which we now use. Only worth revisiting if we
  need stats RIA doesn't give (e.g. our own regional/trim cuts). See [[profitability-definition]].
- [ ] **B12 — Relist/duplicate heuristic** (VIN / phone-hash). FR-008.
- [ ] **B13 — Durable rate budget** (Postgres-backed) if we run multiple instances or restart often.
  See [[0004-drop-redis-bullmq|ADR-0004]].
- [ ] **B14 — Dictionary cache** (id↔name) if a flow needs name→id resolution. (T017)
- [ ] **B15 — Integration test** end-to-end alert path with a DB harness. (T015)
- [ ] **B16 — Operator alerting** on budget exhaustion / source down (dead-man's-switch). (FR-012 / T038)
- [ ] **B17 — Scale:** paid API tier / wider coverage; explore [[alternative-sources]] if the API
  stays too limiting.

## Related
- [[00-INDEX]] · [[goals]] · [[monitoring-approaches]] · [[profitability-definition]]
