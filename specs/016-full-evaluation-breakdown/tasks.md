# Tasks: Full evaluation breakdown

**Spec**: `spec.md` · **Plan**: `plan.md` · **Created**: 2026-08-03

## Format: `[ID] [P?] [Story] Description`

`[P]` = parallelizable (different files, no ordering dependency).

## Path Conventions

Pure rendering logic in `src/modules/notifications/format/`, Telegram wiring in
`src/modules/notifications/telegram/`, stored reads in `src/modules/query/`. Tests in `test/unit/`
and `test/integration/`.

---

## Phase 1: Foundational — the shared builder (BLOCKING)

**Nothing below starts until this phase is complete.** Building the button first would create the
fifth divergent formatter this spec exists to eliminate.

- [ ] T001 Define `BreakdownSection` and `Breakdown` value objects in
      `src/modules/notifications/format/breakdown.types.ts`. Each line carries `label`, `value`,
      `availability`, and an optional `reason`.
- [ ] T002 [P] Unit tests in `test/unit/breakdown.spec.ts` over V1, V2, and V3 explanation fixtures:
      every emitted parameter traces to a record field; a version-missing field yields
      `unavailable` with the version reason; an empty `factors` array yields the
      "factors inactive" reason, not an empty section.
- [ ] T003 Implement the pure builder `src/modules/notifications/format/breakdown.ts` —
      `EvaluationExplanation → Breakdown`. Sections in decision order: identity, price and
      benchmark, cohort, mileage, score decomposition, factors, flags by source, confidence,
      monetary, verdict. Switch on `schemaVersion`; never recompute a value.
- [ ] T004 Refactor `formatWhy` and `formatStoredWhy` (`why-message.ts`) to consume the builder.
- [ ] T005 Refactor `formatAssessment` (`opportunity-message.ts`) to consume the builder.
- [ ] T006 Run the existing `/why`, alert-format, and integration suites unchanged. **Exit
      condition for the phase** — parameters previously rendered must be unchanged (SC-003).

---

## Phase 2: User Story 16.2 — Деталі button (P1) 🎯 MVP

### Tests

- [ ] T007 [P] [US16.2] Unit tests for the renderer: a breakdown exceeding the Telegram limit
      splits at a section boundary with numbered parts, never mid-section (FR-007).
- [ ] T008 [P] [US16.2] Integration test: alert delivered → button tapped → breakdown replied,
      with **zero** budget-ledger entries recorded (SC-002).

### Implementation

- [ ] T009 [US16.2] Attach the `Деталі` inline button to opportunity and price-drop alerts in
      `src/modules/notifications/telegram/telegram.notifier.ts`. Callback data `details:<listingId>`
      — listing UUID only, no encoded state (64-byte limit).
- [ ] T010 [US16.2] `src/modules/notifications/telegram/details-callback.ts`. Its module MUST NOT
      inject `LISTING_SOURCE`, so a source call is impossible by construction (FR-002).
- [ ] T011 [US16.2] Stored-read path in `src/modules/query/query.service.ts` returning the
      persisted explanation for a listing id.
- [ ] T012 [US16.2] Section-boundary message splitting with `(n/m)` part markers.
- [ ] T013 [US16.2] Handle the three degenerate cases: no persisted explanation → say the
      evaluation predates persistence and offer `/check`; deleted listing → plain "no longer
      available"; repeat taps → identical reply, no charge.
- [ ] T014 [US16.2] Assert the pushed alert body line count is unchanged (SC-001).

**Checkpoint:** the operator's request is satisfied here. Phases 3–4 are consistency and
future-proofing.

---

## Phase 3: User Story 16.3 — Surface adoption (P2)

- [ ] T015 [P] [US16.3] Test: one listing rendered through button, `/why`, and `/check` produces
      an identical section order and identical parameter labels (SC-004).
- [ ] T016 [US16.3] `/check` renders the shared section layout from a live `ValuationResult`, and
      states that it is the only surface that may spend a source request.
- [ ] T017 [US16.3] Reduce `formatAssessment` and `formatStoredWhy` to thin adapters over the
      builder; delete any duplicated label or flag-grouping logic left behind.

---

## Phase 4: User Story 16.4 — Forward compatibility (P2, test-only)

- [ ] T018 [P] [US16.4] Fixture carrying `factors`, `assessmentConfidence`, and `monetary`; assert
      all three sections render with **no renderer code change** relative to the fixture that lacks
      them (SC-006).
- [ ] T019 [US16.4] Assert the monetary section renders subordinate to the score sections, and that
      the AI section (spec 017) is absent — it is rendered separately per ADR-0019 §8.

---

## Phase 5: Polish & cross-cutting

- [ ] T020 [P] Update `knowledge-offers-analyzer/architecture/overview.md` (notifications module)
      and `domain/glossary.md` if any term changed during implementation.
- [ ] T021 [P] `npm run vault:build` then `npm run vault:check:strict`.
- [ ] T022 Verification gate: `typecheck`, `lint`, full Jest, contract Jest, Nest build — all via
      RTK (`rtk npm test`), or the native equivalent with the fallback stated in the task record.

---

## Dependencies & Execution Order

### Phase dependencies

Phase 1 blocks everything. Phase 2 is independently shippable after it. Phases 3 and 4 may run in
either order. Phase 5 last.

### User story dependencies

US16.2, US16.3, and US16.4 all depend on the Phase 1 builder and on nothing else. None of them
depends on spec 003 activation or spec 006 — US16.4 only proves those will slot in.

### Parallel opportunities

T002, T007, T008, T015, T018, T020, T021 are `[P]`.

---

## Implementation Strategy

**MVP = Phase 1 + Phase 2.** That delivers exactly what the operator asked for: a compact alert with
the full breakdown one tap away.

This spec computes nothing. Its output is thin today — `score === priceCore`, `factors` is empty,
and `assessmentConfidence` and `monetary` do not exist yet — and grows automatically as the ADR-0010
combined rollout and SPEC-006 land. That is the point of Phase 4: prove the growth needs no renderer
change.

## Notes

- Never recompute a value in the builder. If it is not in the record, it is `unavailable` with a
  reason.
- Never render an unavailable parameter as `0` or a bare dash (FR-004).
- The AI analysis section belongs to spec 017 and is rendered in its own labelled block — do not
  merge it into this breakdown (ADR-0019 §8).
