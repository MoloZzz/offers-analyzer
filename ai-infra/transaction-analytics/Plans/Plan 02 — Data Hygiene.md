---
summary: Transfers, NBU rates, subscriptions: own transfers are not expenses, and everything is converted to UAH.
---
# Plan 02 — Data hygiene (transfers, rates, subscriptions)

## Goal
The statistics do not lie: own transfers are not expenses, everything is converted to UAH,
and recurring payments are known to the system.

## Scope
- In: internal transfer detection, NBU rate service + cache, subscription detection.
- Out: commercial bank rates; predicting subscriptions in advance (fact detection only).

## Data model
- `Transaction`: + `isInternalTransfer boolean`, `linkedTransactionId?`.
- `ExchangeRate(date, currency, rateMinorScaled)` — NBU cache, UNIQUE(date, currency).
- `RecurringPayment(id, normalizedMerchant, expectedAmountMinor, currency, periodDays,
  lastSeenAt, active)`.

## Steps
1. **Transfers**: job finds pairs (different own accounts, opposite signs, |amount| matches
   within a conversion tolerance, time ±24 hours) → marks and links both. Manual unlink/link.
2. **NBU**: NBU API client (rate by date), cache in `ExchangeRate`, 1 request per (date, currency).
   Helper `toBaseUah(amountMinor, currency, date)`. This service is also used by roadmap step 6
   (estimate, `rateSource=NBU`).
3. **Subscriptions**: job groups by normalizedMerchant, looks for ≥3 charges with a period of
   28–33 days (or 6–8/89–95) and amount ±10% → creates/updates `RecurringPayment`;
   deactivates it if 2 periods are missed.

## Acceptance criteria
- [ ] A transfer between own cards (including cross-currency UAH→USD) is marked; it is absent
      from expense aggregations (pair test case).
- [ ] An asymmetric pair (a real expense) is NOT marked (negative test).
- [ ] The NBU rate for a date is returned from cache on a repeated request (mock HTTP → 1 call).
- [ ] `toBaseUah` uses integer minor units, with no floats ([[Invariants]] #1).
- [ ] A subscription with 3+ repeats is detected in fixtures; one-off purchases are not.
- [ ] Unit + integration tests, `tsc` clean.
