---
summary: What this is, for whom, why, principles and explicit out-of-scope.
---
# Vision & Goals

## What this is
A personal financial tracker for one person (not a platform, not SaaS).
A high-quality personal tool, open to adding analytics later — but without premature
“ultra-platform” expansion.

## Why (the problem)
Money lives in different places — cards (Monobank, other banks) and crypto (Binance P2P,
on-chain deposits). There is no single picture:
- you cannot see all transactions in one place;
- it is not clear how much crypto actually cost in hryvnias when you buy through P2P
  (hryvnia left the card → crypto arrived);
- manual spreadsheet bookkeeping is tedious and breaks down.

## Goals
1. Collect card transactions and crypto top-ups into one normalized database.
2. Link the card withdrawal to the crypto inflow (P2P purchase) so we can see the true
   fiat cost of crypto. See [[Card↔Crypto Matching]].
3. Show it — a simple dump into Google Sheets; analytics may come later.

## For whom
One user (the owner). Therefore: no multi-tenancy, no roles, no userId.
This is a deliberate simplification — see [[Decision Log]] and [[Invariants]] #4.

## Principles
- Simplicity by default. Add complexity only when it creates real value now, not
  “someday”. Skeptical of unnecessary abstractions, integrations, and layers.
- Extensibility matters more than completeness. A new data source must be added outside,
  without reworking the core — the main architectural compass (see [[Providers]], [[Invariants]] #3).
- Value first. See your own transactions first, then make it more sophisticated.
- Money precisely. Never float; only integer minor units (see [[Invariants]] #1).

## Explicit boundaries (out of scope for now)
- No budgeting/forecasts, no push notifications, no web UI (yet).
- No investment PnL with lot-tracking (FIFO) — but the scheme is not broken for this:
  each crypto row = one asset movement leg, the leg link is through metadata (`tradeRef`),
  so future FIFO remains possible. See [[Data Model]].
- No multi-user support.
