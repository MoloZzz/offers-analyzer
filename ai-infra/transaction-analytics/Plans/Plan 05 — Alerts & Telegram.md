---
summary: Rule-based alerts for budgets, anomalies, and subscriptions, delivered through Telegram.
---
# Plan 05 — Alerts + Telegram delivery

## Goal
The system reports important events automatically: budget overruns, anomalies, and new subscriptions —
instantly in Telegram, plus a periodic digest.

## Scope
- In: notifier abstraction, Telegram channel, rule-based alerts, weekly/monthly digest.
- Out: push/email; two-way bot (bot commands are separate, later).

## Data model
- `AlertLog(id, type, dedupeKey UNIQUE, payload jsonb, sentAt)` — alert idempotency.

## Steps
1. `Notifier` interface + `TelegramNotifier` (bot token + chatId from env only — NR3) +
   `NullNotifier` for tests/local use. Add it alongside the existing Sheets subscriber (NR1).
2. Rules (each = a separate class with one contract):
   - budget ≥80% and ≥100% (once per month per budget — dedupeKey);
   - anomalous expense: amount > mean + 2σ for the category over 90 days (min. 10 observations);
   - large transaction: > threshold from env;
   - new subscription (from [[Plan 02 — Data Hygiene|RecurringPayment]]);
   - duplicate charge: same merchant+amount within 5 minutes.
3. Triggers: subscribe to `transaction.created` (instant) + cron after daily sync (budgets).
4. Digest (cron, weekly + monthly): summary from [[Plan 03 — Aggregations]] +
   [[Plan 04 — Budgets & Goals]] in a human-readable format.

## Acceptance criteria
- [ ] Each alert is sent **once** (rerunning the rule → 0 messages;
      test dedupeKey).
- [ ] A Telegram failure does not break sync (isolation, as with Sheets — [[Events & Export]]).
- [ ] Secrets are absent from code and DB (NR3); without a token, NullNotifier is used and everything works.
- [ ] Each rule has a unit test (triggers/does not trigger on fixtures).
- [ ] The digest is built from aggregates and contains: cash flow, top categories, budget status.
- [ ] Integration test with a mock notifier; `tsc` clean.
