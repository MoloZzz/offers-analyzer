---
summary: Category limits with status and pace, plus savings goals with progress.
---
# Plan 04 — Budgets and savings goals

## Goal
Expense control: category limits with status and pace, plus savings goals with progress.

## Scope
- In: category/month budgets, savings goals, expected charge calendar.
- Out: rollover of unspent balances; shared budgets.

## Data model
- `Budget(id, categoryId, limitUahMinor, period=monthly, active)`.
- `SavingsGoal(id, name, targetUahMinor, deadline?, funding: manual contributions or
  account linkage)`.

## Steps
1. Migration + CRUD via CLI/SQL (no UI — deliberately).
2. `BudgetService.getStatus(month)`: actuals from [[Plan 03 — Aggregations|AnalyticsService]],
   % used, **pace** = (actual / days elapsed) vs (limit / days in month).
3. `GoalService.getProgress()`: saved / target, projected achievement at the current pace.
4. Calendar: from `RecurringPayment` ([[Plan 02 — Data Hygiene]]) — expected charges
   over 7/30 days, with amount.
5. Output: section in the CLI report + Sheets sheet.

## Acceptance criteria
- [ ] Budget status is correct on boundary dates (first day, last day, local time).
- [ ] Pace: overspending against pace is detected mid-month (test: 60% of the limit in 10 days).
- [ ] A parent-category budget includes child categories.
- [ ] Goal progress and projection are calculated deterministically on fixtures.
- [ ] The calendar shows a subscription expected within the next 7 days (fixture).
- [ ] Unit + integration tests, minor units, `tsc` clean.
