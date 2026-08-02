---
summary: transaction.created event and Google Sheets subscriber; batched flush instead of per-event write.
code:
  - src/events/**
  - src/subscribers/**
rev: bd171cbdae89
---
# Events & Export

Side effects only through the `transaction.created` event (→ [[Invariants]] #6). The sync
knows nothing about export; export knows nothing about sync/providers.

## Event
- Constant `TRANSACTION_CREATED = 'transaction.created'`, interface `EventBus` (in Nest
  it is wrapped by `EventEmitter2`).
- `SyncService` emits the event **only for actually created** rows (not for dedupe hits).
- For now there is **one** subscriber — we do not multiply subsystems unnecessarily (canon: [[Invariants]] #6).

## Google Sheets subscriber
- Listens to `transaction.created`, **buffers** rows and makes **one batch append** on
  `flush()`. A full backfill means thousands of events, so per-event writes to Sheets
  would be slow and rate-limited — hence the buffer + one flush at the end of the run.
- `transactionToSheetRow` — display layer: `formatMinor` produces a human amount from
  minor units (crypto without loss), the date is UTC ISO, the account column is
  (maskedPan/or id).
- `SheetsClient` — a thin interface (`appendRows`). Live `GoogleSheetsClient` via
  `google-auth-library` (service-account JWT) + Sheets REST; if there are no creds —
  `NullSheetsClient` (the sync still writes to the DB).

## Config (env)
```
GOOGLE_SERVICE_ACCOUNT_JSON=   # inline JSON or file path
SHEETS_SPREADSHEET_ID=
SHEETS_TAB=Sheet1
```
Without these variables export is disabled (Null client), and the DB is filled as usual.

## Future (same event)
Analytics, AI categorization (source is `mcc` in `metadata`) — added as new
subscribers, without changes to sync/provider.
