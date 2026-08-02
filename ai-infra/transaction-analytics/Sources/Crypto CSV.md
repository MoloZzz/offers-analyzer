---
summary: Binance P2P and deposit CSV: column formats, asset scales, and the externalId hash.
code:
  - src/providers/binance/**
rev: 7a9c952b4991
---
# Crypto CSV

Crypto source from Binance CSV (`backend/src/providers/binance/`). Status — [[Roadmap & Status]].
→ [[Roadmap & Status]]

## Two providers (each = a separate parser + separate `source`)
1. **`BinanceP2pProvider`** (`source: 'binance_p2p_csv'`) — Binance P2P order history:
   fiat amount, **rate**, crypto quantity. → critical for [[Card↔Crypto Matching]] (the rate comes
   from the CSV; we do not calculate it ourselves). Context (rate, fiat amount, counterparty) goes in `metadata`.
2. **`BinanceDepositProvider`** (`source: 'binance_deposit_csv'`) — Binance deposit history:
   on-chain deposits, **without fiat**. Estimating cost basis requires the NBU rate for the date
   (estimate). → [[Card↔Crypto Matching]] scenario 2.

Format selection (which file is P2P or deposit) is handled in **configuration** (two separate
env paths, `BINANCE_P2P_CSV_PATH` / `BINANCE_DEPOSIT_CSV_PATH`), not auto-detected from
content.

## ACTUAL COLUMN FORMAT (assumption — Binance does not document a public CSV schema)
No official column specification for these two CSVs was found (the P2P/Deposit export UI generates
the file itself; there is no public schema). The parser targets a **realistic but not 1:1-confirmed**
format; if a user's actual export differs, only the corresponding
`binance-*.provider.ts` (column mapping) needs adjustment; the contract/core is untouched.

**P2P order history** (`__fixtures__/p2p-orders.sample.csv`), header:
```
Order Number,Order Type,Asset Type,Fiat Type,Total Price,Price,Quantity,Time(UTC),Counterparty,Status
```
- `Order Type` — `BUY`/`SELL` from the account owner's perspective.
- `Time(UTC)` — `YYYY-MM-DD HH:mm:ss`, already UTC (without timezone conversion).
- `Quantity`/`Total Price` — may be printed with extra zeros after the decimal
  (e.g. `320.00000000`) regardless of the asset's actual scale.

**Deposit history** (`__fixtures__/deposit-history.sample.csv`), header:
```
Date(UTC),Coin,Amount,Network,Address,TXID,Status
```
- `Date(UTC)` — the same format as the P2P `Time(UTC)`.
- `TXID` — required (a row without it is rejected with an error; it is the only reliable
  natural key for an on-chain deposit).

## Model / mapping
- Types `buy/sell/deposit` (from `TransactionType`) map to the same
  [[Data Model|NormalizedTransaction]] (no separate table is needed). `fee`/`withdraw`
  are out of scope — there is no data source for them.
- **P2P → one leg = the crypto part of the order.** `BUY` → positive crypto inflow, `SELL` →
  negative outflow. The fiat side (amount + rate) gets no separate row — it lives in
  `metadata` (`fiatAmountMinor` as a **string** of minor units — not BigInt/float,
  `fiatCurrencyCode`, `fiatDecimals`, `rate` as the raw CSV string, `counterparty`,
  `tradeRef` = order number). `tradeRef` is a forward reference (a hook for
  step 5/possible grouping of multiple rows from one trade).
- **Deposit → one leg = incoming asset movement**, without fiat/`tradeRef`. `metadata`:
  `txId`, `network`, `address`, `status`.
- Neither provider adds an `account` (these CSVs have no «card/account» concept —
  `accountId` remains `null`, explicitly allowed by [[Data Model]]).
- `externalId` — `buildExternalId(['binance_p2p_csv', orderNumber])` /
  `buildExternalId(['binance_deposit_csv', coin, txId])`. We hash even when the CSV has
  its own id (order number / TXID) — one externalId scheme for all CSV providers,
  resilient to future column format changes.
- Amounts are minor units of the asset with its own `decimals`; the table is in `providers/binance/asset.ts`
  (**assumption, documented in code**): `USDT`/`USDC` = 6, `BTC` = 8, `ETH`/`BUSD` = 18,
  unknown asset → fallback 8 (typical display precision in the Binance UI). If the real asset
  has a different canonical scale, this is the only place to change.
- CSV numbers with extra zeros after the decimal (Binance often prints `320.00000000`
  regardless of the actual scale) remain **float-free**: `trimTrailingZeroFraction`
  (string trimming of zeros) before `parseDecimalToMinor` — actual precision loss (non-zero
  digits beyond the declared `decimals`) still throws, as required by [[Invariants]] #1.

## Implementation
- `backend/src/providers/binance/csv.ts` — minimal dependency-free CSV parser
  (quotes/commas/CRLF/BOM); generic, not Binance-specific — also suitable for
  [[Bank CSV]] (step 7).
- `backend/src/providers/binance/{asset,decimal,time}.ts` — scale table, zero trimming,
  UTC time parsing.
- `backend/src/providers/binance/{binance-p2p,binance-deposit}.provider.ts` — the
  providers themselves; file path passed through the constructor (`filePath`), not hardcoded.
- Configuration: `BINANCE_P2P_CSV_PATH` / `BINANCE_DEPOSIT_CSV_PATH` in `.env`
  (`config/app-config.ts`); registration — `+2 rows` in the `app.module.ts` factory
  (`TRANSACTION_PROVIDERS`), with the rest of the core unchanged.
- Tests: `*.spec.ts` for each helper and provider (dates/scale/hash/tradeRef/both formats) +
  `binance-csv.int-spec.ts` (import both CSVs → `SyncService` → Postgres, idempotency).
  Run status and counts are only in [[Roadmap & Status]] (the single source of truth);
  current numbers are generated in `_gen/context.txt`.

## Future work (do not break this now)
Investment PnL will require lot-tracking (FIFO) and base/quote pairs. We are **not building**
the schema for this yet, but leave a bridge: each crypto row = one leg of an asset movement;
trade legs are linked through `tradeRef`/`groupId` in `metadata`.

## Open questions
- The exact P2P/Deposit CSV column format has not been checked against a real user export
  (Binance does not publish a schema) — check it on the first real import and adjust
  column mapping if needed.
- Crypto `fee`/`withdraw` types do not yet have a source provider (they were out of scope
  for this step).

## Encoding
Read CSVs with their encoding/separators in mind (usually UTF-8 here, with a possible BOM;
the parser handles this). For banks, see [[Bank CSV]].
