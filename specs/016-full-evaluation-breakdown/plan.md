# Implementation Plan: Full evaluation breakdown

**Spec**: `spec.md` · **Created**: 2026-08-03 · **Status**: Phases F and 1 implemented 2026-08-05;
Phases 2–3 open

## Summary

Extract one pure breakdown builder from the persisted `EvaluationExplanation`, refactor the four
existing formatters to consume it, then add a **Деталі** inline button under alerts that renders it.
No value is computed here; this is a reach-and-consistency change.

## Technical Context

- **Builder placement (decision):** `src/modules/notifications/format/breakdown.ts` — pure,
  framework-free, `EvaluationExplanation → Breakdown`. It lives in `format/` rather than
  `valuation/` because it is presentation: valuation must not grow a dependency on how things are
  displayed.
- **Refactor order (decision):** builder and its tests land **before** the button. Adding the
  button first would create the fifth divergent formatter this spec exists to prevent.
- **Availability is explicit (decision):** each line carries
  `availability: 'available' | 'unavailable'` with a reason, mirroring the `ValuationFact` shape
  already used by SPEC-015 evidence. The existing precedent is deliberate — old records must show
  whether a field was absent or merely unknown, and the breakdown inherits that discipline.
- **Callback plumbing:** reuse the `outcome-callback.ts` pattern. Callback data is
  `details:<listingId>`; it must fit Telegram's 64-byte callback payload limit, so the listing UUID
  is carried directly with no encoded state.
- **Source-free guarantee:** the callback handler resolves through the query module's stored-read
  path only (the same one `/why` uses for `formatStoredWhy`). It has no `ListingSource` dependency
  injected, so a source call is impossible by construction rather than by discipline — this is what
  makes SC-002 structurally true.
- **Message splitting:** split on `BreakdownSection` boundaries with `(1/2)` part markers. Splitting
  is a property of the renderer, not the builder.
- **Schema tolerance:** the builder switches on `schemaVersion` and emits `unavailable` lines with
  the reason `"запис створено до версії N"` for fields a record predates. V3 (spec 006) is additive,
  so this is a forward-compatible switch, not a migration.

## Constitution Check

- **I SDD:** spec → plan → tasks precede code. ✅
- **II Vault:** ADR-0019 accepted in the same task; glossary/overview updates at implement time. ✅
- **III Clean/simple:** one pure module; four formatters get *smaller*, not larger. No new
  dependency. The abstraction is justified by four existing call sites, not by anticipation. ✅
- **IV Ports & adapters:** no external system touched. ✅
- **V Limits:** zero API budget; the callback handler cannot reach a source. ✅
- **VI Tests:** builder unit-tested per schema version; existing format tests are the regression
  guard. ✅
- **Operator test (ADR-0006 §6):** a перекуп deciding whether to drive across the city wants the
  inputs, not just the verdict — but wants them on request, not in every push. ✅

## Data Model

- No entity change, no migration. `BreakdownSection` and `Breakdown` are value objects.
- Read-only over `Listing.lastExplanation` / `Opportunity.explanation`.

## Design & Phasing

### Phase F — Foundational: the builder (blocking)

`breakdown.ts` + unit tests across V1/V2/V3 fixtures. Refactor `formatWhy`, `formatStoredWhy`,
`formatAssessment` to consume it. Existing tests are the exit condition — behaviour for already-
rendered parameters must not change.

### Phase 1 — US16.2 Деталі button

Attach the inline button in `telegram.notifier.ts` for opportunity and price-drop alerts; add
`details-callback.ts`; wire the stored-read path. Handle missing explanation, deleted listing, and
long messages.

### Phase 2 — US16.3 Surface adoption

`/check` renders the shared section layout from a live result. `/why` renders it from storage.

### Phase 3 — US16.4 Forward compatibility

Fixtures carrying factors, `assessmentConfidence`, and `monetary`; assert the sections render with
no renderer change. This phase is a test-only proof of the property, not new rendering code.

### Rollout / safety

- Every phase is presentation-only; `isOpportunity` and the alert set cannot change (FR-005),
  asserted by the existing integration suite.
- The button is additive — old alerts without it keep working through `/why` (US16.2 AS-2).
- Revertible by removing the button row; the builder refactor stands alone.

## Complexity / risk tracking

| Risk | Mitigation |
|---|---|
| A fifth divergent formatter appears anyway | Builder lands first (Phase F) and the four existing formatters are refactored in the same phase |
| Callback handler grows a source dependency later | The handler's module does not inject `LISTING_SOURCE`; adding it would be a visible, reviewable change |
| Breakdown becomes unreadably long as spec 003/006 land | Section-boundary splitting from day one; sections ordered most-decisive-first |
| Old records render misleadingly | Explicit `unavailable` + reason per line; never zero, never a bare dash |
| Callback payload outgrows 64 bytes | Carry only the listing UUID; no encoded state |

## Related

- `spec.md` · [ADR-0019](../../knowledge-offers-analyzer/decisions/0019-advisory-only-ai-analysis.md) ·
  [ADR-0018](../../knowledge-offers-analyzer/decisions/0018-assessment-confidence-and-monetary-output.md)
- Depends on: B23. Feeds: spec 003, spec 006, spec 017 (which renders its own labelled section)
