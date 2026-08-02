---
summary: A category and normalized merchant for every transaction — the foundation for analytics, budgets, and alerts.
---
# Plan 01 — Categorization + merchants

## Goal
Every transaction has a category and normalized merchant — the foundation for all
analytics, budgets, and alerts.

## Scope
- In: categories (hierarchy), automatic categorization (MCC + rules), manual override,
  merchant normalization, recategorization of existing data.
- Out: ML categorization; UI for rule management (rules are seeded + stored in the DB, managed through SQL/CLI).

## Data model
- `Category(id, name, parentId?)` — 2 levels are sufficient.
- `CategoryRule(id, priority, matcherType: mcc|merchant|description_regex, pattern, categoryId)`.
- `Transaction`: + `categoryId?`, `categorySource: auto_mcc|auto_rule|manual`,
  + `normalizedMerchant?`.
- `MerchantRule(pattern → normalizedMerchant)` — the same rule mechanism.

## Steps
1. Migration: categories, rules, and new transaction columns.
2. Seed: base category tree + MCC → category mapping (MCC is already in Monobank metadata).
3. `CategorizationService`: pipeline manual > rule (by priority) > mcc > null.
   Called during sync/import (subscriber to `transaction.created` or a sync step).
4. Normalize the merchant before categorization (rules + trim/lowercase/branch numbers).
5. Manual override endpoint/CLI: set category → `categorySource=manual`.
6. Job to recategorize existing data (does not touch manual values).

## Acceptance criteria
- [ ] ≥80% of transactions in the real database receive a category automatically (measure with a job).
- [ ] Manual override wins over any automatic value and **survives resync** and recategorization.
- [ ] Repeated sync does not change categories (idempotency, in the spirit of [[Invariants]] #4).
- [ ] «ATB #123» and «ATB 456» → the same `normalizedMerchant` (test case).
- [ ] Unit: priority pipeline, MCC mapping, merchant normalization, regex rules.
- [ ] Integration: sync → categorized transactions in the DB.
- [ ] `tsc` is clean, and existing tests are green.
