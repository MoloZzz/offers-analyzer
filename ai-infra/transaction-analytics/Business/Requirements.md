---
summary: Functional R1-R13 and non-functional NR1-NR4 tracker requirements.
---
# Requirements

Functional requirements for the personal tracker. Priority — “value first” (see [[Roadmap & Status]]).

## Transaction collection
- **R1.** Pull transactions for Monobank cards through the personal API. → [[Monobank]]
- **R2.** Pull crypto top-ups from Binance CSV: P2P orders (with fiat+rate) and
  deposit history (on-chain, without fiat). → [[Crypto CSV]]
- **R3.** (later) Import bank CSVs (Privat etc.). → [[Bank CSV]]
- **R4.** Each transaction is normalized into one model regardless of source.
  → [[Data Model]], [[Providers]]
- **R5.** Sync is **idempotent** — repeated runs do not create duplicates
  (`UNIQUE(source, externalId)`). → [[Invariants]] #4
- **R6.** Sync is **incremental** — daily runs pull only new data (watermark =
  `max(bookedAt)` per source), instead of replaying the whole history. → [[Sync Engine]]

## Accounts/cards
- **R7.** Each transaction is tied to an account/card (where it came from). It is visible
  as “card ••1234 / UAH”, and can be grouped and filtered. → [[Data Model]]

## Money and currencies
- **R8.** Amounts are stored as **integers in minor units** (kopeks/cents; crypto —
  in its own minor units with scale). Never float. → [[Invariants]] #1
- **R9.** Amount currency = account currency (because Monobank `amount` is in the account
  currency). Operation currency/amount (cross-currency) is in `metadata`.
  → [[Monobank]], [[Decision Log]]
- **R10.** Time is UTC; local time is only for display/grouping. → [[Invariants]] #2

## Card ↔ crypto matching (key value)
- **R11.** After both sources are loaded, a separate stage links a card debit in hryvnias
  to a P2P crypto inflow. Match is 1-to-1, with confidence, and with manual override.
  → [[Card↔Crypto Matching]], [[Invariants]] #5
- **R12.** For crypto deposits without a card (exchange) — estimate fiat via NBU rate on
  the transaction date (estimate, `rateSource=NBU`). → [[Card↔Crypto Matching]]

## Export
- **R13.** Export to Google Sheets is a simple row dump, via the `transaction.created`
  event, isolated from sync. → [[Events & Export]]

## Non-functional
- **NR1.** Extensibility: a new source = a new provider, core untouched.
- **NR2.** Each step is covered by tests (unit for normalize/match, integration for
  provider+sync). → [[Roadmap & Status]]
- **NR3.** Secrets (Monobank token, Google service-account) — only through env/secrets,
  never in code or DB in plain text.
- **NR4.** Respect source limits (Monobank: 1 request/60s, window ≤31 days). → [[Monobank]]
