# Budget Report Contract

`QueryService.budgetReport()` is read-only and returns a `BudgetReportDigest` for the current
source/month. It must contain pool/daily/reserve status, allowed and denied activity groups,
actual-vs-ADR allocation lines, run-rate forecast, reconciliation difference, and `rolloutReady`.

Telegram command: `/budget` replies with the formatted digest and performs no listing-source call.
