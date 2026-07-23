# Feature Specification: Post-Deal Outcomes (realized margin)

**Feature Branch**: `007-deal-outcomes`

**Created**: 2026-07-23

**Status**: Draft (US7.1–7.2 in implementation; US7.3–7.4 later phases)

**Input**: Backlog epic "Оцінка вигідності v2" (2026-07-22), SPEC-007 entry. Addendum to
[ADR-0006](../../knowledge-offers-analyzer/decisions/0006-operator-profit-vision.md);
precondition for CHANGE-002.1 (re-target spec 002 auto-tuning to realized margin).

## Context & Problem

Spec 002's auto-tuning optimizes precision on the 👍/👎 labels captured on each alert. But 👍
means "looks like a good alert," **not** "made money." The operator thumbs-up cheap listings, so
better auto-tuning on this label converges the system toward "looks cheap" — exactly the
population of wrecked/scammy/problem cars. Optimizing the current label makes the *product* worse.

The fix is to capture what actually happened *after* the alert — did the operator buy, at what
price, what did repair + paperwork cost, did it sell, for how much, how long did it sit — and
compute the **realized margin** (`sell − buy − costs`) and realized days-on-market. This is the
ground truth spec 002 should eventually optimize (US7.3), the calibration input for SPEC-006's
money model (US7.4), and — cheaply — a `decline_reason` that surfaces flags a physical inspection
catches but the scoring never sees.

**What already exists and is NOT rebuilt here**: the append-style `outcomes` table + 👍/👎
buttons + `/outcome` command (spec 002 E2 — a *label* stream, no structured economics, kept
untouched); `Opportunity`→`Listing` link by `listingId`; the alert inline-button plumbing
(`Notifier.buttons`, `oc:` callbacks); the weekly `/report` digest.

## Guiding constraints (non-negotiable)

- **Zero extra API requests.** Outcomes are operator-entered; no source calls.
- **Operator-cheap capture.** One tap to decline-with-reason; one single-shot command for the
  numbers; every field optional. No multi-step wizard (the codebase has no telegraf scenes and we
  are not adding a state machine for this).
- **Non-destructive to spec 002.** The existing 👍/👎 precision pipeline keeps working unchanged;
  deal outcomes are a *separate* record, so nothing moves the live threshold until CHANGE-002.1
  deliberately re-targets it (US7.3, gated on ≥15 closed deals).
- **Stateful, upsertable.** A deal progresses declined → bought → sold; one row per listing,
  patched as facts arrive, never a duplicate stream to re-fold later.

## User Scenarios & Testing *(mandatory)*

### User Story 7.1 — Post-deal outcome form (Priority: P0) — THIS PHASE

From an alert, the operator records the deal's fate: a one-tap **decline** with a reason
(condition / documents / seller / price / other), or a **bought** tap, then a single-shot
`/deal <link> buy=… costs=… sell=… dom=… reason=…` command to fill economics as the deal
progresses. All fields optional; re-invoking patches the same row.

**Independent Test**: tap 🛒 Купив on an alert → a `deal_outcomes` row appears at
`stage='bought'` linked to the listing + opportunity; `/deal <link> sell=10200` on it flips it to
`stage='sold'`; tapping ❌ Відмова then a reason button records `stage='declined'` with that
reason.

**Acceptance Scenarios**:

1. **Given** an alert with the deal buttons, **When** the operator taps ❌ Відмова then a reason,
   **Then** one `deal_outcomes` row is recorded (`stage='declined'`, that `declineReason`,
   `opportunityId` + `listingId` set) and re-tapping updates rather than duplicates.
2. **Given** an alert, **When** the operator taps 🛒 Купив, **Then** the row is `stage='bought'`
   with `boughtAt` stamped, and the bot replies with a copy-ready `/deal` template.
3. **Given** a bought deal, **When** the operator sends `/deal <link> buy=8500 costs=300
   sell=10200 dom=21`, **Then** the same row carries those numbers, flips to `stage='sold'` with
   `soldAt` stamped, and the reply echoes the computed margin.
4. **Given** a listing never alerted (recorded via `/check` or poll), **When** the operator sends
   `/deal <link> …`, **Then** it still records against the listing (`opportunityId` null).
5. **Given** a bought-but-unsold deal older than the reminder window, **Then** the operator is
   nudged once per window to close it (never daily-nagged).

### User Story 7.2 — Realized margin & DOM (Priority: P0) — THIS PHASE

Compute realized margin = `sell_price − buy_price − actual_costs` (costs default 0) and realized
DOM (operator-entered `daysOnMarket` wins, else `soldAt − boughtAt`), aggregated over *closed*
deals (bought + sold with both prices) and surfaced in `/report` and `/deals`.

**Independent Test**: two closed deals with known numbers → `/report` shows the correct median
margin, loss-making share, and median DOM; an incomplete deal (sold without a buy price) is
excluded from the aggregate and shown as "неповна".

**Acceptance Scenarios**:

1. **Given** closed deals with buy+sell prices, **Then** median realized margin, share of
   loss-making deals, and median realized DOM appear in `/report` and `/deals`.
2. **Given** a deal missing buy or sell price, **Then** its margin is null and it is excluded from
   the median (never counted as a $0 deal).
3. **Given** no closed deals yet, **Then** the report/`/deals` say so instead of showing zeros.

### User Story 7.3 — Re-target auto-tuning to realized margin (Priority: P0) — LATER PHASE

Re-point spec 002's tuning metric from 👍-precision to `median(realized margin)` + share of
loss-making deals; the threshold does not move until ≥15 closed deals accrue. *(Not implemented
this phase — CHANGE-002.1. Data model here already makes `closedDeals()` a one-line query.)*

### User Story 7.4 — Forecast-vs-actual calibration (Priority: P1) — LATER PHASE

Once SPEC-006 (`Z`) ships, compare `Z_forecast` vs `Z_actual` on closed deals; systematic bias
corrects `k`, `torg`, `C_rec`. *(Not implemented this phase.)*

### Edge Cases

- Re-tapping a button / re-sending `/deal` → idempotent upsert (one row per listing), never a
  duplicate.
- `stage` never downgrades: a `sold` deal is not knocked back to `bought` by a later buy-only
  `/deal`; a `bought` deal is not made `declined` by a stray reason.
- `/deal` on a listing not yet in the DB → "оцініть спершу через /check" (same miss reply as
  `/outcome`).
- Negative realized margin is valid and kept (it is the whole point of the loss-making metric).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-701**: The system MUST persist one `deal_outcomes` row per listing (unique on `listingId`),
  upserted as the deal progresses; each write applies only the supplied fields.
- **FR-702**: Alerts (opportunity + price-drop) MUST carry a 🛒 Купив / ❌ Відмова button row in
  addition to the existing 👍/👎 row.
- **FR-703**: ❌ Відмова MUST present a one-tap reason keyboard (condition/documents/seller/price/
  other) and record `stage='declined'` + `declineReason`.
- **FR-704**: 🛒 Купив MUST record `stage='bought'` with `boughtAt` and reply with a copy-ready
  `/deal` template.
- **FR-705**: `/deal <link> [buy= costs= sell= dom= reason=] [note]` MUST patch the row; all
  fields optional; invalid numbers/reasons MUST yield a usage message and record nothing.
- **FR-706**: `stage` MUST derive monotonically (sell ⇒ sold; buy ⇒ bought unless already sold;
  reason ⇒ declined unless bought/sold); `boughtAt`/`soldAt` set once on first transition.
- **FR-707**: Realized margin (`sell − buy − costs`, costs default 0) and realized DOM
  (operator value → else `soldAt − boughtAt`) MUST be computed (never stored) and surfaced in
  `/report` and `/deals` as median margin, loss-making share, median DOM over closed deals.
- **FR-708**: A closed deal MUST be `stage='sold'` with both buy and sell prices present;
  `closedDeals()` MUST exclude incomplete rows.
- **FR-709**: A daily reminder MUST nudge the operator about bought-but-unsold deals older than
  `DEAL_REMINDER_DAYS` (default 30), re-reminding at most once per window (`lastRemindedAt`).
- **FR-710**: Deal outcomes MUST NOT feed spec 002's threshold auto-tuning in this phase (kept
  separate from `outcomes`); US7.3 turns that on deliberately.

### Key Entities

- **DealOutcome**: one row per listing — the deal-economics record (see plan.md §Data Model).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-701**: Recording any outcome adds zero source API requests.
- **SC-702**: A decline reason is captured in exactly two taps from the alert; the full economics
  in one `/deal` command.
- **SC-703**: `/report` and `/deals` show median realized margin, loss-making share, and median
  DOM over closed deals; incomplete deals are excluded from the median.
- **SC-704**: The live alert threshold does not move from deal-outcome data (spec 002 still reads
  `outcomes` 👍/👎 only) until CHANGE-002.1 lands.
- **SC-705**: All existing tests pass unchanged; new pure functions (margin/DOM/stage/stats,
  callback codec, arg parser) and `DealsService` behavior are unit-tested.

## Assumptions

- The operator is the sole user; one deal per listing is sufficient (relists get a fresh listing
  row, hence a fresh deal).
- `daysOnMarket` entered by the operator is authoritative over the derived `soldAt − boughtAt`.
- 30-day reminder cadence is a reasonable default (config-overridable).

## Out of scope (this phase)

- Re-targeting spec 002 auto-tuning (US7.3 / CHANGE-002.1) — blocked on ≥15 closed deals.
- Forecast-vs-actual `Z` calibration (US7.4) — depends on SPEC-006.
- Per-profile margin breakdown (rows carry `opportunityId`→profile; aggregation is later).

## Related

- Backlog SPEC-007 (epic "Оцінка вигідності v2") · ADR-0005 (ParameterSets) ·
  ADR-0006 (vision) · CHANGE-002.1 · SPEC-006 (Z)
- Vault: profitability-definition · glossary · backlog
