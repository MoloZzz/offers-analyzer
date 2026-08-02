---
summary: Backlog for turning the tracker into a financial control system: Plans 00–06 and execution order.
---
# Analytics & Control — Backlog

Confirmed feature list for turning the tracker into a full financial control system:
analytics, budgets, alerts, and insights.
Implementation plans are in the `Plans/` folder (one per block).

> [!warning] Prerequisite
> The crypto core of the roadmap is handled first (Crypto CSV → matching → estimate); the current
> step status is only in [[Roadmap & Status]] —
> that is the product core. The backlog below follows it (Bank CSV — step 7 — was moved here as Plan 00).

## 0. Data completeness
- **Bank CSV import** (Privat + generic parser): Windows-1251, date formats,
  comma decimal separator; format detection separate from mapping. → [[Plan 00 — Bank CSV]]

## 1. Foundation (analytics is impossible without it)
- **Categorization**: hierarchical categories; automatic MCC → category mapping (Monobank provides MCC);
  rules engine (description/merchant → category); manual override that always wins
  and survives resync. → [[Plan 01 — Categorization]]
- **Merchant normalization**: «ATB #123» and «ATB 456» → one counterparty. → [[Plan 01 — Categorization]]
- **Detection of transfers between own accounts** — so a transfer to oneself is not counted as
  expense+income. → [[Plan 02 — Data Hygiene]]
- **NBU exchange rates**: rate service by date + cache; conversion to the base currency (UAH).
  The same service supports step 6 (estimate). → [[Plan 02 — Data Hygiene]]
- **Recurring payment detection** (subscriptions): merchant + amount + period. → [[Plan 02 — Data Hygiene]]

## 2. Analytics
- Expenses/income by category, month, and account; MoM and comparison with the 3–6-month average.
- Cash flow: inflow/outflow, savings rate.
- Net worth over time (account balances + crypto at the current rate).
- Crypto: actual cost basis (from matching), later unrealized PnL (via `tradeRef`).
- Top merchants, expense structure, subscription trends.
→ [[Plan 03 — Aggregations]]

## 3. Control
- **Budgets**: limit by category/month, actuals from aggregations, status + pace.
- **Savings goals**: target + automatic progress tracking.
- **Recurring payment calendar**: expected charges N days ahead.
→ [[Plan 04 — Budgets & Goals]]

## 4. Alerts (rule-based)
- Exceeding 80%/100% of a budget; anomalous expense (above the category baseline);
  large one-off transaction; new subscription; duplicate charge; commission spike.
- Delivery: **Telegram bot** (instant alerts + weekly/monthly digest).
→ [[Plan 05 — Alerts & Telegram]]

## 5. Insights
- Rule-based: «Restaurants +40% above the 3-month average», «savings rate fell from 25% to 10%».
- LLM layer: monthly review from **aggregates** (not raw transactions), disabled by configuration.
→ [[Plan 06 — Insights]]

## Execution order
1. Roadmap steps for the crypto core — outside this backlog
   ([[Plan 07 — Card↔Crypto Matching (step 5)]] — step 5, already complete)
2. Plan 00 — Bank CSV
3. Plan 01 — Categorization
4. Plan 02 — Data hygiene
5. Plan 03 — Aggregations
6. Plan 04 — Budgets and goals
7. Plan 05 — Alerts and Telegram
8. Plan 06 — Insights

## Shared rules (inherited)
- All vault invariants apply: minor units, UTC, idempotency, «new — alongside».
- The Definition of Done for each plan is canonical in [[Roadmap & Status]] and is not duplicated here.
- Secrets (Telegram token, LLM key) — env only (NR3).
