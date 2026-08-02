---
summary: TransactionProvider contract: fetch plus map into NormalizedTransaction, zero business logic.
code:
  - src/providers/**
  - src/core/provider/**
rev: e9bf8bcc3be6
---
# Providers

The only contract the core knows. A new source = a new implementation, core untouched
(→ [[Invariants]] #3).

## Contract
```ts
interface TransactionProvider {
  readonly source: string;                 // 'monobank', 'binance_p2p_csv', ...
  fetch(sinceSec?: number): Promise<NormalizedTransaction[]>;
}
```
- `source` — stable source key.
- `fetch(sinceSec?)` — loads + maps raw fields into `NormalizedTransaction`.
  `sinceSec` is the sync watermark (incremental); without it — its own floor
  (full backfill).
- **Only** fetch + mapping. Zero business logic, zero side effects, zero knowledge of matching.

## NormalizedTransaction (canonical form)
`source`, `externalId`, `amount: bigint`, `currencyCode`, `decimals`, `type`,
`bookedAt: Date (UTC)`, `account?: NormalizedAccount`, `metadata?`.
Validated by `toNormalized()` (BigInt/scale/UTC/non-empty fields) — a shared gate before the DB.

## Shared helpers (`src/core/normalize`)
- `buildExternalId(parts)` — sha256 of stable fields for CSV without a native id.
- `parseDecimalToMinor` / `formatMinor` — float-free string↔BigInt conversion.
- `toNormalized` — invariant gate.

## Implementations
- **[[Monobank]]** — API, windows, rate limit, cross-currency.
- **[[Crypto CSV]]** — Binance P2P + deposit (`binance_p2p_csv` / `binance_deposit_csv`,
  two CSV providers + shared helpers).
- **[[Bank CSV]]** — Privat/generic (later, step 7).

## Registration
In `app.module.ts` the `TRANSACTION_PROVIDERS` factory builds an array from env. Adding
a source = **+1 line** in the factory; the rest does not change.
