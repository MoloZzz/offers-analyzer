---
summary: SyncService: incremental run, dedupe by UNIQUE source-externalId, watermark increment.
code:
  - src/sync/**
rev: e4e1c7a4f382
---
# Sync Engine

`SyncService` (`src/sync/sync.service.ts`). Orchestrates one run: for each provider it
loads normalized transactions, upserts accounts, stores idempotently, and emits events.
Source-agnostic — knows only the `TransactionProvider` contract. → [[Providers]]

## Algorithm (per provider)
1. **watermark** = `MAX(bookedAt)` by `source` (unix seconds) or `undefined` if empty.
2. `rows = provider.fetch(watermark)` — incrementally pulls only new data; empty DB →
   `undefined` → full backfill from the provider floor.
3. **upsert accounts** from account descriptions in `rows` → map `externalId → accountId`
   (enriches `name/maskedPan/currency/type` on every run).
4. **persist**: bulk `INSERT ... ON CONFLICT (source, externalId) DO NOTHING`
   (`.orIgnore()`), setting `accountId`. Returns only **actually created** rows.
5. **emit** `transaction.created` for each created row. → [[Events & Export]]

## Idempotency
Based on `UNIQUE(source, externalId)` (→ [[Invariants]] #4). Repeated runs with
overlapping incremental windows do not create duplicates — `DO NOTHING`.

## Incrementality (watermark)
Every `npm run sync` pulls only new data, not the whole history every time. The
watermark is computed in the sync layer (it has DB access); the provider is called
only with plain fetch, which receives `sinceSec`. The first run (empty DB) = full backfill.

> [!warning] Snapshot at start
> `now` is fixed at the start of the run; transactions that appear during a long
> backfill land in the next sync. This is expected.

## Entrypoint
`npm run sync` → `src/sync.command.ts`: boots a headless Nest context → `sync()` →
`SheetsSubscriber.flush()` → summary log → exit. Idempotent, safe to repeat.

## Local run
```
cp .env.example .env      # DATABASE_URL + MONOBANK_TOKEN
npm i
npm run db:up && npm run migration:run
npm run sync
```
