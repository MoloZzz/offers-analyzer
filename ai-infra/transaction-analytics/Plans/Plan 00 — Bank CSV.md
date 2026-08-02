---
summary: Complete card data: import statements from other banks as a new provider, without core changes.
---
# Plan 00 — Bank CSV import

## Goal
Complete card data: import statements from other banks (Privat first) as a new provider,
without core changes.

## Scope
- In: PrivatCsvParser + generic CSV parser, CLI file import command.
- Out: automatic statement downloads from bank APIs; web file uploads.

## Steps
1. `FormatDetector` — detect the format (bank) separately from mapping.
2. Decode Windows-1251 → UTF-8 (iconv-lite), detect encoding.
3. `PrivatCsvParser`: dates (local format → UTC), comma decimal separator →
   `parseDecimalToMinor`, map to `NormalizedTransaction`.
4. `externalId` = deterministic row hash via `buildExternalId` (there is no stable id).
5. `privat_csv` provider following the [[Providers]] contract; link to Account
   (create the account from the statement if absent).
6. CLI: `npm run import:csv -- --file=path --format=privat`.

## Acceptance criteria
- [ ] A real Privat statement imports; re-importing the same file adds 0 new rows (R5).
- [ ] Amounts are integer minor units, with no floats ([[Invariants]] #1); cross-check:
      statement total = amount in the DB.
- [ ] Dates are stored in UTC ([[Invariants]] #2).
- [ ] The core (normalize, sync, entity) is unchanged — only a new provider (NR1).
- [ ] Unit: parser (encoding, dates, comma decimals, negative amounts, stable hash).
- [ ] Integration: import → DB against real Postgres.
- [ ] `tsc` is clean, and all existing tests are green.
