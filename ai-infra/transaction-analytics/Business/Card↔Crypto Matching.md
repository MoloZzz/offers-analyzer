---
summary: Main domain value: gross UAH cost of crypto through the link between card debit and P2P inflow.
code:
  - src/matching/**
rev: 5308f431b2bf
---
# Card ↔ Crypto Matching

The tracker’s main domain value: see the actual UAH cost of crypto by linking the card withdrawal to the crypto inflow.

> [!note] This is a separate post-processing stage (canon: [[Invariants]] #5)
> Matching starts after both sources are loaded into the DB — this is a separate post-processing stage, canon: [[Invariants]] #5. Providers do not know about it. Match is 1-to-1, with confidence, and with optional manual override.

## Two scenarios

### 1. P2P purchase (there is a card → crypto match) — step 5
Binance **P2P CSV** contains: fiat amount, rate, USDT amount.
The match links the **card debit** to the crypto inflow if:
- `|cardAmount – fiatCost| ≤ tolerance` (amounts are within tolerance);
- the card time is within the **~0–2 hour window before** receiving the crypto.

We take the rate from **CSV** — we do not compute anything ourselves.

### 2. Exchange / deposit without card (no match) — step 6
Crypto on-chain deposit without a corresponding card debit.
- `fiat = cryptoAmount × rate(date)`;
- USDT ≈ $1; USD/UAH are taken from the **NBU API** on the transaction date;
- we mark `rateSource = NBU`, and this is an **estimate** (not a fact).

## What we store — `CryptoPurchase`
| field | meaning |
|---|---|
| `cryptoTxId` | link to the crypto transaction (inflow) |
| `cardTxId?` | link to the card debit (if a match exists) |
| `matchType` | `p2p` (match) or `estimate` (NBU rate) |
| `asset` | asset (e.g. USDT) |
| `cryptoAmount` | crypto amount (minor units) |
| `fiatCurrency` | fiat currency (UAH) |
| `fiatAmount` | fiat cost (minor units) |
| `rate` | rate |
| `rateSource` | `CSV` (P2P) or `NBU` (estimate) |

## Match quality rules
- **1-to-1**: one crypto inflow ↔ at most one card debit.
- **confidence**: how strong the match is (amount fit + time window).
- **manual override**: the user can confirm/reassign/unmatch a match.

## Where matching data comes from
- Card side: Monobank transactions; useful fields are already in `metadata`
  (`operationAmount`, `operationCurrencyCode`, `mcc`, counterparty). → [[Monobank]]
- Crypto side: [[Crypto CSV]] (P2P stores rate+fiatCost in `metadata`).

## Status
Step statuses are only in [[Roadmap & Status]] (single source of truth). Implementation:
`src/modules/crypto-purchases/entities/crypto-purchase.entity.ts`,
`src/matching/match-selection.ts` (pure selection function) +
`src/matching/matching.service.ts` (I/O, upsert), entrypoint `npm run match`.
