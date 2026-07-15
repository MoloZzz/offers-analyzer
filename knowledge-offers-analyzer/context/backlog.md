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
  `discountThresholdPct`. Delete `src/common/database/migrations/*.ts`, `npm run migration:generate`,
  `migration:run`. (We are migrations-only now — see [[coding-standards]].)
- [ ] **B2 — Validate AUTO.RIA field mappings** against 3 real responses (`search`, `info`,
  `average_price`) and fix the adapter (`arithmeticMean`/`total`/`USD` are guesses). Blocks correct
  scoring. See `specs/001-.../contracts/auto-ria-api.md`, [[monitoring-approaches]].
- [ ] **B3 — Decide the search strategy** once B2 is known: if `search`/list returns prices →
  "score-from-list, `info` only for winners"; else → "N+1, newest-first". Then implement
  budget-cursor polling (newest-first, stop at budget, round-robin across profiles) + `countpage=100`.
- [ ] **B4 — Make the pipeline actually run:** a real **enabled** `SearchProfile` with real ids
  (today only a disabled placeholder is seeded). Folds into B5.

## 🟡 Next — US2 (operator config + currency)

- [ ] **B5 — SearchProfile config** (create/edit/enable) operator-side. Spec 001 US2 / FR-010.
- [ ] **B6 — FX / currency:** `ExchangeRate` NBU adapter + normalization; per-profile currency
  switch in valuation and alert. FR-014. (`fx/` today is port-only.)
- [ ] **B7 — Apply all per-profile config** end-to-end (threshold=minDealScore ✅, dealer policy ✅,
  currency, enable/disable) and cover with a unit test. US2.

## 🟡 Next — US3 (trust & bot)

- [ ] **B8 — Telegram bot commands:** `/start /subscribe /unsubscribe /mute /profiles /help`. FR-015.
- [ ] **B9 — Richer alert:** show the deal score + all reasoning fields + seller; label (not
  celebrate) suspicious discounts. Spec 001 US3 / FR-007.

## 🟢 Later — deferred (promote when picked up)

- [ ] **B10 — Re-observe known listings** → price-drop detection (FR-009). Competes for the budget.
- [ ] **B11 — Own-statistics valuation:** median/percentiles from our stored listings instead of only
  the RIA average. See [[profitability-definition]].
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
