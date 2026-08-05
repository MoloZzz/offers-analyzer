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

- [X] T001 Define `BreakdownSection` and `Breakdown` value objects in
      `src/modules/notifications/format/breakdown.types.ts`. Each line carries `label`, `value`,
      `availability`, and an optional `reason`.
- [X] T002 [P] Unit tests in `test/unit/breakdown.spec.ts` over V1, V2, and V3 explanation fixtures:
      every emitted parameter traces to a record field; a version-missing field yields
      `unavailable` with the version reason; an empty `factors` array yields the
      "factors inactive" reason, not an empty section.
- [X] T003 Implement the pure builder `src/modules/notifications/format/breakdown.ts` —
      `EvaluationExplanation → Breakdown`. Sections in decision order: identity, price and
      benchmark, cohort, mileage, score decomposition, factors, flags by source, confidence,
      monetary, verdict. Switch on `schemaVersion`; never recompute a value.
      *Added a `provider` section between mileage and score to hold the SPEC-015 stored evidence
      `/why` already rendered — it had no home in the planned list.*
- [X] T004 Refactor `formatWhy` and `formatStoredWhy` (`why-message.ts`) to consume the builder.
      Both are now one-line adapters; `buildLiveBreakdown` is the live-computation entry point.
- [X] T005 Refactor `formatAssessment` (`opportunity-message.ts`) to consume the builder. `/check`
      keeps its compact shape (full section layout is T016) but takes its score total and risk line
      from the builder, so flag grouping is no longer duplicated here.
- [X] T006 Run the existing `/why`, alert-format, and integration suites unchanged. **Exit
      condition for the phase** — parameters previously rendered must be unchanged (SC-003).
      *513/513 green after Phase 1; no existing assertion changed.*

---

## Phase 2: User Story 16.2 — Деталі button (P1) 🎯 MVP

### Tests

- [X] T007 [P] [US16.2] Unit tests for the renderer: a breakdown exceeding the Telegram limit
      splits at a section boundary with numbered parts, never mid-section (FR-007).
      `test/unit/details-callback.spec.ts`.
- [X] T008 [P] [US16.2] Integration test: alert delivered → button tapped → breakdown replied,
      with **zero** budget-ledger entries recorded (SC-002).
      `test/integration/details-button.spec.ts` — a real `QueryService` with live jest mocks for the
      source and the budget, asserted never called.

### Implementation

- [X] T009 [US16.2] Attach the `Деталі` inline button to opportunity and price-drop alerts.
      Callback data `details:<listingId>` — listing UUID only, no encoded state (64-byte limit).
      *Implemented in `notifications.service.ts` (`alertButtons`), not `telegram.notifier.ts`: the
      notifier is a channel-agnostic transport that renders whatever button rows it is handed, and
      the alert keyboard has always been composed in the service.*
- [X] T010 [US16.2] `src/modules/notifications/telegram/details-callback.ts`. Its module MUST NOT
      inject `LISTING_SOURCE`, so a source call is impossible by construction (FR-002). Asserted by
      a source-text test that strips comments and requires the module to have **no imports at all**.
- [X] T011 [US16.2] Stored-read path in `src/modules/query/query.service.ts` returning the
      persisted explanation for a listing id — `storedBreakdownById`, a discriminated union over
      `ok` / `listing_missing` / `no_explanation`.
- [X] T012 [US16.2] Section-boundary message splitting with `(n/m)` part markers.
- [X] T013 [US16.2] Handle the three degenerate cases: no persisted explanation → say the
      evaluation predates persistence and offer `/check`; deleted listing → plain "no longer
      available"; repeat taps → identical reply, no charge.
- [X] T014 [US16.2] Assert the pushed alert body line count is unchanged (SC-001).

**Checkpoint:** the operator's request is satisfied here. Phases 3–4 are consistency and
future-proofing.

---

## Phase 3: User Story 16.3 — Surface adoption (P2)

- [X] T015 [P] [US16.3] Test: one listing rendered through button, `/why`, and `/check` produces
      an identical section order and identical parameter labels (SC-004).
      `test/unit/breakdown-surface-parity.spec.ts` — 5 tests. The strongest is structural: stripping
      each section block's title line reassembles `renderBreakdownFlat` **exactly**, so the two
      renderers provably diverge by the title and by nothing else.
- [X] T016 [US16.3] `/check` renders the shared section layout from a live `ValuationResult`, and
      states that it is the only surface that may spend a source request.
      *Two deliberate consequences.* (a) **Seller type and the odometer reading leave `/check`**: the
      shared breakdown carries neither for any surface — a persisted `EvaluationExplanation` never
      captured them — and re-adding them for `/check` alone would recreate the per-surface divergence
      this spec exists to remove. Both remain on the pushed alert, which is not a breakdown surface.
      (b) The call site now passes the **real** cohort context (`sampleSize`, `benchmarkBase`,
      `mileageAware` off `Assessment`) instead of the previous `0` / `fairValue` / `true` defaults —
      those were harmless while `/check` read only two lines out of the builder, but would have
      rendered an invented cohort and mileage correction under the full layout (SC-005).
- [X] T017 [US16.3] Reduce `formatAssessment` and `formatStoredWhy` to thin adapters over the
      builder; delete any duplicated label or flag-grouping logic left behind.
      *`formatStoredWhy` was already one line from T004.* `formatAssessment` is now one expression
      and its private `breakdownLine` lookup helper is gone. `risksLabel`, `sellerLabel`,
      `mileageLabel`, `scoreEmoji`, `confidenceLine`, `signed` and `fmt` **stay** — they are the
      *alert's* formatting, still reached from `formatOpportunity` / `formatPriceDrop`, and the alert
      is frozen by SC-001. `findLine` keeps its export but lost its last production caller; it is now
      documented as the value object's test-facing query accessor.

---

## Phase 4: User Story 16.4 — Forward compatibility (P2, test-only)

- [X] T018 [P] [US16.4] Fixture carrying `factors`, `assessmentConfidence`, and `monetary`; assert
      all three sections render with **no renderer code change** relative to the fixture that lacks
      them (SC-006). `test/unit/breakdown-forward-compat.spec.ts` — the proof is *differential*: a
      bare V3 and a populated V3 that differ only in those three fields emit byte-identical section
      keys and identical section titles in identical order, so the populated record adds no section
      and removes none. Both fixtures are V3 with explicit `null`s, exercising the
      carried-but-not-measured branch rather than the pre-schema `undefined` one.
- [X] T019 [US16.4] Assert the monetary section renders subordinate to the score sections, and that
      the AI section (spec 017) is absent — it is rendered separately per ADR-0019 §8.
      *Subordination is asserted against `score`, `factors` **and** `confidence`.* AI-absence is a
      closed allow-list over the section keys plus a length check, so a future section added to
      `assemble()` fails the test rather than slipping through a `not.toContain`.

---

## Phase 5: Polish & cross-cutting

- [X] T020 [P] Update `knowledge-offers-analyzer/architecture/overview.md` (notifications module)
      and `domain/glossary.md` if any term changed during implementation. Also
      `research/explainability-gaps.md` (the note that owns this problem), `Roadmap & Status.md`,
      `specs/README.md`, `context/CURRENT.md`, and `context/log/2026-08-05-*`. New glossary terms:
      **Evaluation breakdown**, **Availability (breakdown line)**.
- [X] T021 [P] `npm run vault:build` then `npm run vault:check:strict` — 0 errors, 0 warnings.
- [X] T022 Verification gate: `typecheck`, `lint`, full Jest (526/526, 63 suites incl. contract),
      Nest build — all pass. **Fallback stated:** run natively with `npm.cmd`; the bundled RTK
      wrapper is a Linux/musl binary and does not execute on this Windows runtime.

**Phase 5 re-run for phases 3–4 (2026-08-05).** T020–T022 were repeated after T015–T019, since the
definition of done binds each slice, not each spec: `Roadmap & Status.md`, `specs/README.md`,
`architecture/overview.md`, `research/explainability-gaps.md` and `context/CURRENT.md` updated (the
supersession sweep found five notes still saying "phases 3–4 remain open"); `vault:build` +
`vault:check:strict` → 0 errors, 0 warnings; `typecheck`, `lint`, Jest **537/537 (65 suites)** and
`nest build` all pass. The count fell from 539 because `oa-verifier` found two duplicate tests and
each property was given a single owner.

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
