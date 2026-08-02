---
summary: Post-processing layer linking a card debit to a P2P crypto inflow; providers know nothing about it.
code:
  - src/matching/**
rev: 5308f431b2bf
---
# Plan 07 — Card↔crypto matching (step 5)

Separate post-processing layer ([[Invariants]] #5): link a hryvnia card debit to a P2P crypto inflow.
Providers know nothing about matching ([[Invariants]] #5). → [[Card↔Crypto Matching]]

## Step 5 scope (P2P BUY only)
- Candidates — crypto legs `source='binance_p2p_csv'`, `type='buy'` (inflow). SELL and
  deposit-estimate (NBU rate) are outside step 5 (deposit = step 6).
- Fiat cost is already known from the CSV (in `metadata`: `fiatAmountMinor`, `fiatCurrencyCode`,
  `fiatDecimals`, `rate`). Matching looks for the **card debit that funded it**.

## Matching rule (P2P)
Debit candidate: `source='monobank'`, `amount < 0`, `currencyCode = fiatCurrencyCode`,
`bookedAt ∈ [cryptoTime − window, cryptoTime]` (debit **before** the crypto is received),
`|abs(cardAmount) − fiatAmount| ≤ tolerance`, and **not already used** by another purchase.
Best = minimum |Δamount|, then minimum |Δtime|. 1-to-1. Rate comes from the CSV; nothing is calculated.
- `window` = `MATCH_WINDOW_SEC`, `tolerance` = `MATCH_TOLERANCE_MINOR` — values and canonical definition
  in [[Card↔Crypto Matching]]
  (default 0 = exact match). Both come from env.

## `CryptoPurchase` entity (new)
`id` uuid PK; `cryptoTxId` uuid FK→transactions ON DELETE CASCADE **UNIQUE** (one purchase per
per crypto asset); `cardTxId` uuid? FK→transactions ON DELETE SET NULL; `asset`; `cryptoAmount`
numeric(38,0)↔BigInt + `cryptoDecimals`; `fiatCurrency`; `fiatAmount` numeric(38,0)↔BigInt +
  (the complete field list is canonical in [[Data Model]])
`fiatDecimals`; `rate` varchar (string, float-free); `rateSource` ('CSV'|'NBU');
`matchType` ('p2p'|'estimate'); `confidence` real?; `manualOverride` bool=false;
`createdAt`/`updatedAt`. Money follows [[Invariants]] #1. → [[Data Model]]

## Components
- `src/modules/crypto-purchases/entities/crypto-purchase.entity.ts`
- Migration `*-AddCryptoPurchases` (table, FK, UNIQUE(cryptoTxId), indexes).
- `src/matching/match-selection.ts` — **pure** function `chooseCardMatch(leg, candidates, opts)`
  (no DB, easy to unit-test).
- `src/matching/matching.service.ts` — I/O around it: fetch legs+ candidates, upsert
  `CryptoPurchase` by `cryptoTxId`, do not touch `manualOverride=true`, 1-to-1 per card.
- `src/match.command.ts` + `npm run match` (post-processing, separate from sync).
- Register the Entity in `config/database.config.ts` + `forFeature`; `MatchingService` in
  `app.module.ts`; `MATCH_*` in `app-config.ts` + `.env.example`.

## Idempotency
Upsert by `cryptoTxId`; a repeated run neither duplicates nor clobbers `manualOverride`.

## Acceptance criteria
- [x] `chooseCardMatch` unit: exact match; outside window; amount difference > tolerance;
  nearest selection; no candidate; already-used debit excluded.
- [x] Integration: monobank UAH debit + P2P BUY (fiat=debit, time within window) → one
  `CryptoPurchase` with `cardTxId`, `rateSource='CSV'`, `matchType='p2p'`, high `confidence`.
- [x] Integration: P2P BUY without a matching debit → `CryptoPurchase` with `cardTxId=null`.
- [x] Integration: repeated `run()` is idempotent; `manualOverride=true` is not overwritten.
- [x] `tsc` clean, `npm test` green, `npm run test:int` green.
- [x] Vault updated (DoD): [[Data Model]] (new entity), [[Decision Log]] (decision),
  [[Roadmap & Status]] (status/tests).
- [x] No [[Invariants|invariant]] is violated (matching is a separate layer; providers are untouched).
