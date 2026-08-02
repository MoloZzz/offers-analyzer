---
summary: Seven unbreakable rules of the project — the constitution. A violation means stop and rework.
code:
  - src/core/**
rev: 9b00294467a9
---
# Invariants

Unbreakable rules. Violation = stop and rework. This is the project's "constitution".

## 1. Money is always integers in minor units, never float
Fiat — kopeks/cents; crypto — its own minor units with scale. DB type is
`numeric(38,0)`, code type is `BigInt`. Currency/asset (`currencyCode`) and `decimals`
(scale) are stored **next to** the amount. Human format is only a display/export layer.
→ [[Data Model]], `money.ts`, `bigint.transformer.ts`

## 2. Dates are UTC in the DB
`bookedAt`/`createdAt` are `timestamptz`, always UTC. Local time/timezone is only for
display and grouping.

## 3. The core does not know about the source
No `if (source === 'monobank')` in `core/normalize/sync`. A new source = a new
provider folder under the `TransactionProvider` contract. No exceptions. → [[Providers]]

## 4. Dedup and multi-tenancy
- **Single-user** app: **no `userId`** (deliberate simplification).
- Dedupe uniqueness: **`UNIQUE(source, externalId)`**.
- Sync is **idempotent**: repeated runs do not create duplicates (by design).

## 5. Matching is a separate post-processing stage
The card↔crypto link is calculated **after** both sources are loaded into the DB.
Providers do not know about it. Match is 1-to-1, with confidence, and with manual
override. → [[Card↔Crypto Matching]]

## 6. Side effects — only through events
Google Sheets, future analytics/AI categorization — through a subscription to
`transaction.created`. The exporter does not know about providers. For now there is
**one** subscriber — we do not multiply subsystems unnecessarily. → [[Events & Export]]

## 7. Secrets — env/secrets only
Monobank token, Google service-account JSON — never in code or DB in plain text.
`.env` is in `.gitignore`.

---
### Consequences
- Provider = `fetch()` + mapping; zero business logic.
- All providers return `NormalizedTransaction`; the normalize layer is a shared
  discipline (BigInt/scale/UTC validation, `externalId` hash).
- Cross-currency: `amount` is marked with the account currency; the operation currency
  is in `metadata`. → [[Monobank]]
