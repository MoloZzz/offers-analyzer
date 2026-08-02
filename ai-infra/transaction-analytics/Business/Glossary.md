---
summary: Terms: Transaction, Account, CryptoPurchase, provider, normalize, minor units, scale.
---
# Glossary

- **Transaction** — normalized record of money movement (fiat or crypto), source-agnostic.
  Stored in the `transactions` table. → [[Data Model]]
- **Account** — source account/card (Monobank account, crypto account). A transaction
  is linked through `accountId`. → [[Data Model]]
- **NormalizedTransaction** — canonical form into which a provider maps raw source data;
  1:1 with the entity. → [[Providers]]
- **Provider** — implementation of one source under the `TransactionProvider` contract
  (`fetch(sinceSec?)`). Only fetch + field mapping, no business logic. → [[Providers]]
- **Source** — source key (`monobank`, `binance_p2p_csv`, `binance_deposit_csv`, …).
- **externalId** — stable record id within a source; for CSV — a deterministic row hash.
  Together with `source` it forms the dedupe key. → [[Invariants]] #4
- **Minor units** — the smallest unit of a currency: kopeks/cents (scale 2), satoshi
  (BTC scale 8), wei (ETH scale 18). We store money only this way.
- **decimals / scale** — number of decimal places of a currency/asset; stored together
  with the amount so it can be displayed later.
- **bookedAt** — transaction time in UTC.
- **watermark** — `max(bookedAt)` per source; lower bound of incremental sync.
  → [[Sync Engine]]
- **mcc** — Merchant Category Code; Monobank provides it, we store it in `metadata`,
  and it is a source for future categorization.
- **P2P** — peer-to-peer crypto purchase for fiat (Binance P2P). → [[Card↔Crypto Matching]]
- **operationAmount / operationCurrency** — operation amount/currency (Monobank), unlike
  the amount in the account currency; for cross-currency payments. → [[Monobank]]
- **CryptoPurchase** — result entity of card↔crypto matching: one crypto leg plus fiat
  cost and, if a match is found, the card debit. → [[Card↔Crypto Matching]], [[Data Model]]
- **rateSource** — source of the rate used to estimate fiat: `CSV` (from P2P) or `NBU` (estimate).
