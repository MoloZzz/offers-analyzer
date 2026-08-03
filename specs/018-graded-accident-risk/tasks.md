# Tasks: Graded accident risk

**Spec**: `spec.md` · **Plan**: `plan.md` · **Created**: 2026-08-03

## Format: `[ID] [P?] [Story] Description`

`[P]` = parallelizable (different files, no ordering dependency).

## Path Conventions

Pure logic in `src/modules/valuation/`, lexicon in `config/heuristics/`, reporting in
`src/modules/query/`, rendering in `src/modules/notifications/format/`. Tests in `test/unit/` and
`test/integration/`.

---

## Phase 1: Foundational — classifier, lexicon, anti-gaming floor (BLOCKING)

- [x] T001 Build a labelled uk+ru description corpus in `test/fixtures/accident-corpus.ts` covering
      each bucket, negated phrasings, disclosure-only wording, and contradiction cases (bar says
      damaged, text denies). This is the measurement instrument for SC-002/SC-003 — build it first.
- [x] T002 `config/heuristics/accident-severity.json` — decompose the existing
      `AFTER_ACCIDENT_PLAIN`. `'тотал'`, `'розбит'`, `'разбит'`, `'аварійн'`, `'аварийн'` → `severe`,
      joined by cut/replaced pillars and roof, deployed airbags, altered geometry, flood, rollover,
      «конструктор», «розпил». `'після дтп'` / `'после дтп'` → a **disclosure** list (an accident
      happened, severity unstated). Add `cosmetic` and `moderate` marker lists. Content-hash
      recorded on the active `ParameterSet`.
- [x] T003 [P] Unit tests `test/unit/accident-severity.spec.ts`: structural marker → `severe` with
      evidence listed; «після ДТП замінено бампер» **without** VIN evidence → `unknown`, **with** it
      → `cosmetic` (FR-003); empty description + `damaged=true` → `unknown` with "severity not
      established"; «не був у ДТП» → nothing fires (FR-010).
- [x] T004 Implement pure `src/modules/valuation/accident-severity.ts`. Resolve as
      `max(barSeverity, textSeverity)`; admit a text verdict below `unknown` **only** when
      `risk.vinChecked || hasVinReport`. Implement that as an explicit **floor**, not a scoring
      weight — a floor cannot be out-earned by a deep discount, a penalty can.
- [x] T005 [P] Anti-gaming test: across the corpus, **no** description-only claim of minor damage
      reaches `cosmetic` without corroboration (SC-003), and **zero** `severe` cases classify below
      `severe` (SC-002).
- [x] T006 Preserve `condition.ts` behaviour unchanged — `assessCondition` keeps returning its
      existing booleans. The new classifier is a separate module, not a rewrite (FR-010).

---

## Phase 2: User Story 18.2 — Shadow recording + rollout report (P1, ungated) 🎯

- [x] T007 [P] [US18.2] Bit-for-bit regression test: with shadow recording on, `score`, `priceCore`,
      `total100`, `isOpportunity`, `disqualified`, and the alert set are identical to the
      recording-off run across the full fixture corpus (SC-001). **Exit condition for the phase.**
      → `test/integration/accident-shadow-equivalence.spec.ts`.
- [x] T008 [US18.2] Compute the verdict on every evaluation and persist `AccidentSeverity` in the
      evaluation explanation (additive, alongside spec 006's V3 fields). The current
      `disqualifying: true` rules stay untouched. → verdict computed in `computeValuation`;
      explanation `V3` also carries `heuristicTableHashes` (the carried-over T002 item).
- [x] T009 [US18.2] Admin-only rollout report in `src/modules/query/` over persisted explanations
      plus `ListingDisappearance`: suppressed-listing counts by bucket, their would-be scores, and
      subsequent relist/disappearance outcomes. Read-only, zero new requests. → `/accident_shadow`.
- [x] T010 [US18.2] The report MUST state that it authorizes a review, not a flip (FR-007).
- [ ] T011 [US18.2] Let it run for a full month before Phase 3 is considered. **Window opens on the
      first production poll cycle after this deploys** — Phase 3 must not be opened before then.

**Checkpoint:** this phase changes nothing observable and produces the evidence ADR-0011 requires.
If it shows suppressed listings were reliably bad deals, **the correct outcome is not to flip.**

---

## Phase 3: User Story 18.3 — The flip (P1, gated on Phase 2 + operator approval)

- [ ] T012 [P] [US18.3] Tests: flip off → bit-for-bit identical to pre-018; flip on → a `cosmetic`
      listing at a given discount alerts where it previously could not, while `severe` and `salvage`
      still never alert at any discount (SC-005).
- [ ] T013 [US18.3] Add `accidentGradingEnabled` and `accidentPenaltyByBucket` to
      `ParameterSet.params`. Absent → today's clamp behaviour.
- [ ] T014 [US18.3] In `red-flags.ts`, resolve `disqualifying` for the accident rules from the
      active `ParameterSet` instead of hardcoding it. This is the **only** structural change to that
      file — soft-penalty composition and `SOFT_FLAG_CODES` stay untouched so spec-002 weight
      learning is unaffected.
- [ ] T015 [US18.3] Keep `salvage` and the `severe` bucket hard in every configuration (FR-002) —
      assert this is not reachable through any `ParameterSet` value.
- [ ] T016 [US18.3] `unknown` applies its bounded penalty **and** sets a verify-before-travelling
      marker (FR-004).
- [ ] T017 [US18.3] Ship **disabled**. Enabling is one operator-approved activation; revert is
      reactivating the prior `ParameterSet` version — no code change, no migration (FR-006).
- [ ] T018 [US18.3] Compare `/report` precision over a matched window before and after (SC-007).

---

## Phase 4: User Story 18.4 — Explanation surfaces (P2)

- [ ] T019 [P] [US18.4] Test: each bucket renders a distinct, evidence-cited line; the `unknown`
      wording states severity is unestablished and never implies minor damage (FR-004).
- [ ] T020 [US18.4] Render severity, matched evidence, corroboration state, and applied penalty in
      `/why` and in the spec-016 breakdown's flags section.
- [ ] T021 [US18.4] Review the `unknown` wording explicitly with the operator — it must not read as
      reassurance.

---

## Phase 5: Polish & cross-cutting

- [ ] T022 [P] Update `knowledge-offers-analyzer/domain/glossary.md`, `research/profitability-definition.md`,
      and `architecture/overview.md` for anything that changed during implementation.
- [ ] T023 [P] `npm run vault:build` then `npm run vault:check:strict`.
- [ ] T024 Verification gate: `typecheck`, `lint`, full Jest, contract Jest, Nest build — all via
      RTK (`rtk npm test`), or the native equivalent with the fallback stated in the task record.

---

## Dependencies & Execution Order

### Phase dependencies

Phase 1 blocks everything. Phase 2 is independently shippable and ungated. **Phase 3 requires
Phase 2's month of evidence plus explicit operator approval** — it is the only phase in this spec
that changes live behaviour. Phase 4 follows Phase 3.

### User story dependencies

US18.1 blocks all. US18.2 depends only on US18.1. US18.3 depends on US18.2's evidence, not just its
code. US18.4 depends on US18.3.

### Parallel opportunities

T003, T005, T007, T012, T019, T022, T023 are `[P]`.

---

## Implementation Strategy

**Ship Phases 1 + 2 now.** They change nothing observable and produce exactly the rollout evidence
ADR-0011 demands. **Phase 3 is deliberately not shippable on the same pass** — it changes the alert
set, and the project's standing rule is that a scoring change is measured before it is made.

The flip should be considered alongside the ADR-0010 combined rollout rather than as an independent
threshold event, so the operator faces one before/after comparison instead of two.

## Notes

- The corroboration rule is a **floor**, not a weight. Do not reimplement it as a penalty — a deep
  enough discount would out-earn a penalty.
- `salvage` and `severe` stay hard in every configuration. No `ParameterSet` value may reach them.
- Do not touch `suspicious_discount > 45%` here; it is a separate rule with a separate rationale.
- Do not merge the classifier into `condition.ts` — different questions, different lifecycles.
- `unknown` means "we do not know how bad", never "it was minor".
