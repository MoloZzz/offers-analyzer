---
summary: Single source of computed metrics for reports, budgets, alerts, and insights.
---
# Plan 03 — Aggregation layer (analytics)

## Goal
Single source of computed metrics powering reports, budgets, alerts, and insights.

## Scope
- In: analytics module with aggregation queries + summary export (Sheets sheet or JSON CLI).
- Out: web dashboard; realtime.

## Metrics
- Expenses/income by category × month × account (in UAH via `toBaseUah`).
- MoM change and deviation from the 3/6-month category average.
- Monthly cash flow: inflow, outflow, net; **savings rate** = net/inflow.
- Net worth: sum of account balances + crypto at the current rate (point-in-time snapshot).
- Crypto: cost basis from matching (depends on roadmap step 5).
- Top-N merchants for a period; total active subscriptions/month.

## Steps
1. `AnalyticsModule` + `AnalyticsService` with query methods (QueryBuilder/SQL).
   Filters: `isInternalTransfer = false`, type, period (group by **local** time,
   store in UTC — [[Invariants]] #2).
2. Summary DTOs; CLI `npm run report -- --month=2026-06` → JSON/console.
3. Export the monthly summary to a separate Google Sheets sheet (existing Sheets client).
4. Net worth snapshot: job writes `NetWorthSnapshot(date, totalUahMinor, breakdown jsonb)`.

## Acceptance criteria
- [ ] Numbers match manual SQL on a control sample (document the query in the test).
- [ ] Internal transfers are excluded; income and expenses are not mixed.
- [ ] Monthly boundaries are correct for local time (test: transaction at 23:30 UTC on the last day).
- [ ] Everything uses integer minor units; division (savings rate) has controlled precision.
- [ ] Unit test for each aggregation method (fixtures), integration test against Postgres.
- [ ] `tsc` is clean, and existing tests are green.
