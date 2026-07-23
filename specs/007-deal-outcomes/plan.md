# Implementation Plan: Post-Deal Outcomes (realized margin)

**Spec**: [spec.md](spec.md) · **Created**: 2026-07-23 · **Status**: Phase A in progress

## Summary

Capture what happened after an alert as a stateful `deal_outcomes` record (one row per listing,
upserted declined → bought → sold) and compute realized margin (`sell − buy − costs`) + realized
DOM over closed deals. Capture is operator-cheap: a two-tap decline-with-reason and one single-
shot `/deal` command (all fields optional), plus a daily reminder to close bought-but-unsold
deals. Zero API cost. The existing 👍/👎 `outcomes` pipeline is untouched, so spec 002's live
threshold is unaffected until CHANGE-002.1 (US7.3) deliberately re-targets it.

## Technical Context

- **D1 — new `deal_outcomes` table, not the append-style `outcomes`.** A deal is a *stateful*
  record with structured economics; `outcomes` is a label stream whose `bought`/`resold` labels
  carry no numbers. Overloading it would force US7.3 to reconstruct deal state from label
  sequences. A dedicated table makes "closed deals" one indexed query and leaves spec 002's
  precision inputs untouched.
- **D2 — Telegram UX without a state machine** (matches the codebase — single-shot commands +
  one-tap callbacks; no telegraf scenes anywhere):
  - Alerts gain a second button row `🛒 Купив` / `❌ Відмова`, new callback prefix `dl:`
    (mirrors `outcome-callback.ts`'s `oc:`).
  - ❌ Відмова → the bot replies with a 5-button inline reason keyboard
    (`dl:r:<reason>:<opId>`); one tap records the decline. Longest callback
    `dl:r:condition:<36-char uuid>` = 51 bytes < Telegram's 64-byte limit.
  - 🛒 Купив → records `stage='bought'`, replies with a copy-ready
    `/deal <url> buy=… costs=…` template.
  - `/deal <link> buy=8500 costs=300 sell=10200 dom=21 reason=price [note]` — single-shot,
    every field optional; each call patches the same row.
  - `/deals` lists open (bought, unsold) + recent closed deals with margins.
- **D3 — margin computed, never stored** (pure fn, no denormalized column to drift). Realized
  DOM precedence: operator `daysOnMarket` → else `soldAt − boughtAt` in days → else null.
- **D4 — reminder**: a daily `@Cron` finds `stage='bought'` rows whose `max(boughtAt,
  lastRemindedAt)` is older than `DEAL_REMINDER_DAYS` (config, default 30), broadcasts a nudge,
  and bumps `lastRemindedAt` (re-reminds every N days, never daily). Pattern:
  `ReportSchedulerService`.
- **D5 — nothing blocks US7.3.** Rows carry `opportunityId` (→ `opportunity.profileId` for
  per-profile tuning) and an indexed `stage`; `closedDeals()` exists from day one, so the ≥15-
  closed-deals gate becomes a one-line count when CHANGE-002.1 lands.

## Constitution Check

- **I (Spec-driven)** ✅ this spec + plan + tasks precede code.
- **II (Zero-budget bias)** ✅ outcomes are operator-entered; no source calls (SC-701).
- **III (Explainable)** ✅ realized margin/DOM decompose in `/report` + `/deals`; the record
  stores raw operator inputs, never a black-box aggregate.
- **IV (Tunable via ParameterSet)** ✅ `DEAL_REMINDER_DAYS` is an operational cadence (env
  constant per house style, like the calibration cadence), not a scoring parameter; re-targeting
  the scoring metric (US7.3) is out of scope here.
- **V (Graceful degradation)** ✅ every field optional; missing prices → margin null, excluded
  from the median rather than guessed.
- **VI (Reversible)** ✅ upsert (no destructive fold); `stage` monotonic; migration symmetric down.

## Data Model

New table **`deal_outcomes`** (entity
`src/modules/calibration/entities/deal-outcome.entity.ts`):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `listingId` | uuid, **unique** (`UQ_deal_outcomes_listingId`) | one deal per listing |
| `opportunityId` | uuid, nullable | ties to the alert → profile (US7.3); null for un-alerted listings |
| `stage` | varchar, index `IDX_deal_outcomes_stage` | `'declined'` \| `'bought'` \| `'sold'` |
| `declineReason` | varchar, nullable | `'condition'`\|`'documents'`\|`'seller'`\|`'price'`\|`'other'` |
| `buyPriceUsd` / `actualCostsUsd` / `sellPriceUsd` | numeric, nullable (`numericTransformer`) | operator-entered USD |
| `daysOnMarket` | int, nullable | operator-entered realized DOM (wins over derived) |
| `boughtAt` / `soldAt` | timestamptz, nullable | set once on first stage transition |
| `lastRemindedAt` | timestamptz, nullable | reminder dedup |
| `note` | text, nullable | free-text trailing `/deal` remainder |
| `createdAt` / `updatedAt` | timestamptz | `@CreateDateColumn` / `@UpdateDateColumn` |

Explicit index/constraint names (an auto-hashed name diverges from the migration and makes
`migration:generate` churn — same rule as `outcomes`/`listing_disappearances`).

## Design & Phasing

- **Phase A — US7.1–7.2 (this implementation)**. Slices:
  - **T001–T003** entity + `ENTITIES`/module wiring + generated migration (no-churn).
  - **T004–T007** pure functions (`deal-margin.ts`, `deal-callback.ts`, `deal-args.ts`) + specs.
  - **T008–T009** `DealsService` + fake-repo spec.
  - **T010–T011** alert button row + bot `dl:` actions / `/deal` / `/deals` / HELP +
    `deals-message.ts` formatter.
  - **T012–T013** `/report` realized-margin surfacing.
  - **T014–T015** `DEAL_REMINDER_DAYS` config + `DealReminderService` cron + test.
  - **T016–T017** verification + vault sync.
- **Phase B — US7.3 (later, CHANGE-002.1)**: re-target spec 002's tuning metric to
  `median(realized margin)` + loss-making share; gate on ≥15 closed deals. Tasks at pickup.
- **Phase C — US7.4 (later)**: `Z_forecast` vs `Z_actual` on closed deals once SPEC-006 ships.

## Complexity / risk tracking

- No telegraf state machine → the `/deal` command carries all numbers in one line; the only
  multi-step interaction (decline → reason) is a single extra tap on an inline keyboard, encoded
  in callback data (stateless).
- `stage` monotonicity lives in one pure `deriveStage` fn, unit-tested for every transition, so
  an out-of-order patch can't corrupt a closed deal.

## Related

- [spec.md](spec.md) · [tasks.md](tasks.md) · ADR-0005 · ADR-0006 · backlog SPEC-007 / CHANGE-002.1
