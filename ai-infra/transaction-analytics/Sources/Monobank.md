---
summary: Monobank Personal API: limits, windowed pagination, and a cross-currency pitfall.
code:
  - src/providers/monobank/**
rev: 6b88e191cbd9
---
# Monobank

Personal API, `monobank` source (`src/providers/monobank/*`). Status — [[Roadmap & Status]].

## API
- Base `https://api.monobank.ua`, header `X-Token: <token>` (from `.env`, → [[Invariants]] #7).
- `GET /personal/client-info` → accounts (`id`, `currencyCode` ISO-numeric, `maskedPan[]`, `type`).
- `GET /personal/statement/{account}/{from}/{to}` → array of operations; time in Unix seconds.

## Limits (must be respected)
- **1 request / 60 seconds** to `/statement` (otherwise 429 → backoff).
- Statement window **≤ 31 days + 1 hour = 2682000 s**; exceeding it → **400**.

## How we fetch (windowing)
- Split `[since, now]` into 31-day windows (with a one-second boundary overlap — no gaps;
  duplicates are removed by deduplication).
- Go **newest-first** (from now into the past) and **stop at `400`** — Monobank
  returns 400 (not an empty list) for ranges **before the account existed**, so 400 =
  the boundary of available history. This collects «all history» without failing and without
  knowing the account opening date.
- Between requests, `wait(60s)`; on 429, exponential backoff. `wait`/`now` are injected
  (tests are instant and network-free).

## Money and currency (important pitfall)
- `item.amount` — **in the account currency**, in kopecks (integer). Put it directly into `BigInt`.
- `item.currencyCode` is the **OPERATION** currency, NOT the account currency. Therefore, label
  the amount with the account currency (`account.currencyCode` from client-info); otherwise
  cross-currency operations get the wrong label (e.g. a −780 UAH transfer appeared as «USD»).
- `operationAmount` + `operationCurrencyCode` (operation currency) → into `metadata` (needed
  for [[Card↔Crypto Matching]]).
- Example: −780.00 UAH transfer from a hryvnia card → +17.32 USD; `amount=-78000` (UAH),
  `operationAmount=-1732` (USD), ratio ≈ rate of 45 UAH/USD.

## Mapping → NormalizedTransaction
- `externalId` = `item.id` (stable, without a hash).
- `type` = `transfer` (flat enum).
- `bookedAt` = `new Date(item.time * 1000)` (UTC).
- `account` = `{ externalId: account.id, maskedPan: maskedPan[0], type, currencyCode }`.
- `metadata`: `mcc`, `originalMcc`, `description`, `comment`, `hold`, `balance`,
  `commissionRate`, `cashbackAmount`, `operationAmount`, `operationCurrencyCode`,
  counterparty (`counterName/Iban/Edrpou`), `receiptId`, `accountId`.

## Backfill / incremental sync
- First run = all history (slow: 1 window/60s). After that, incrementally from the watermark.
  → [[Sync Engine]]. Limit the depth with `MONO_SINCE=YYYY-MM-DD` in `.env`.
