---
summary: Bank statement imports: encoding, date formats, and a separate parser class per bank.
---
# Bank CSV

Bank statement imports (Privat and others). **Lower priority** — step 7, after crypto.
→ [[Roadmap & Status]]

## Characteristics
- **Encoding**: Privat often uses Windows-1251 (not UTF-8) — it must be decoded.
- **Date formats** and the **decimal separator** (comma vs period) vary between banks.
- Each bank = a **separate parser class** that maps to [[Data Model|NormalizedTransaction]].
- **Format detection is separate from mapping.**

## Model
- `externalId` — deterministic hash of the row (`buildExternalId`), because there is no stable id.
- Amounts are kopecks (`parseDecimalToMinor`, float-free). → [[Invariants]] #1
- `source` such as `privat_csv`; added as a new provider without touching the core.
  → [[Providers]]
