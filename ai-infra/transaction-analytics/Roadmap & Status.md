---
summary: Single source of truth for step status, current tests, and known nuances.
---
# Roadmap & Status

Implementation order — «value first». → [[Vision & Goals]]

## Steps
- [x] **1. DB + entity Transaction + migration** — `numeric(38,0)`, `UNIQUE(source,externalId)`,
  UTC, jsonb. → [[Data Model]]
- [x] **2. normalize layer + NormalizedTransaction** — provider contract, helpers
  (`buildExternalId`, `money`, `toNormalized`). → [[Providers]]
- [x] **3. Monobank provider + sync → DB and Google Sheet** (first result) — windowed
  pagination, `transaction.created` event, Sheets subscriber. → [[Monobank]], [[Sync Engine]],
  [[Events & Export]]
- [x] **4. Crypto CSV provider** (P2P + deposit formats) → crypto in DB. → [[Crypto CSV]]
- [x] **5. Card↔crypto matching + CryptoPurchase** (P2P BUY, `npm run match`) →
  [[Card↔Crypto Matching]]
- [ ] **6. Estimate for unmatched (NBU rate)** ← **next** → [[Card↔Crypto Matching]]
- [ ] **7. Bank CSV** (Privat, generic) → [[Bank CSV]]

## Additional work completed (outside the initial list)
- [x] Incremental sync from **watermark** (daily run fetches only new data). → [[Sync Engine]]
- [x] **Accounts** — accounts/cards table + FK `accountId` + existing backfill. → [[Data Model]]
- [x] Single `DATABASE_URL`.
- [x] Fix for cross-currency amounts (currency = account currency). → [[Monobank]], [[Decision Log]]

## Definition of Done (each step)
Code works + is covered by tests (unit tests for normalize/matching, integration tests for provider+sync) +
no [[Invariants|invariant]] is violated + it can be run in isolation and its result observed.

## Current tests
Unit **75** (including ~30 for Binance CSV: parser/scale/hash/tradeRef/both formats; **13**
new ones for `chooseCardMatch` — window/amount/tie-break/determinism), integration **21** (against
real Postgres, including Crypto CSV import and **5** new ones for `MatchingService`:
match/no-match/outside window/idempotency+manualOverride/1-to-1). All passed — all green;
`tsc` is clean. Locally: `npm run db:up && npm run test:int`.

## Known nuances
- The first Monobank backfill is slow (1 request/60s) — this is an API limit, not a bug. Limit it with: `MONO_SINCE`.
- Sync is a snapshot at start time; the next run picks up anything newer. → [[Sync Engine]]
- Existing rows from before the currency fix are corrected by SQL propagation from `accounts`. → [[Decision Log]]
- The Crypto CSV integration test was **run against real Postgres — green** (included in
  21/21 int). It previously was not run in the Docker-less sandbox; now confirmed. → [[Crypto CSV]]
- `npm run lint` has ~23 pre-existing errors in files untouched by this step
  (`monobank.provider.spec.ts`, `sheet-row.ts`, `null-sheets.client.ts`,
  `sync.command.ts`, `sync/sync.service.int-spec.ts`, `database/*.int-spec.ts`,
  `main.ts`) — technical debt from earlier steps, not from Crypto CSV. All new/changed
  code (`providers/binance/**`, `app.module.ts`, `config/app-config.ts`) lints
  cleanly.
- **Step 5 (matching) — scope is P2P BUY only.** SELL and deposit-estimate (NBU rate) are outside
  scope; that is step 6. `MatchingService` reads only `binance_p2p_csv`/`buy` and
  `monobank` debits (`amount < 0`); new card/crypto sources do not automatically fall under
  these rules — this will be an explicit decision for step 6/7, not a side effect.
  → [[Card↔Crypto Matching]]
