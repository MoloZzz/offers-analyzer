# Tasks: Auto-Calibration & Outcome-Based Learning

**Input**: Design documents from `specs/002-auto-calibration-learning/`

**Prerequisites**: spec.md, plan.md

**Tests**: INCLUDED — constitution VI. Calibration/statistics are pure functions → unit-tested; the
feedback path gets one integration test.

**Organization**: Grouped by phase/user story for independent delivery. US1 (P1) is the MVP of this
feature; US2 (P2) and US3 (P3) each ship on top.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task).
- **[Story]**: US1/US2/US3 (setup/foundational have no story label).

## Path Conventions

Single NestJS backend: `src/`, `test/` at repo root. New module `src/modules/calibration/`.

## Status (2026-07-17) — kept in sync with the code

Implemented in small, delegated slices (backlog E1/E2/E3). `[X]` done · `[~]` partial · `[ ]` not started.
Deviations from the original plan, made deliberately:
- **Per-profile `minDealScore` stays on `SearchProfile`**, not inside the ParameterSet (ParameterSet holds
  the *global* weights: `scale`, `softFlagPenalty`, mileage factors). Calibration updates the profile.
- **Condition keyword weights are not yet tunable** via ParameterSet (still constants in `condition.ts`) —
  will move under weight-learning (US3).
- **`research.md` was folded into ADR-0005** rather than a separate file (T001).

---

## Phase 0: Research & decision (blocking design)

- [~] T001 Research decisions — **folded into ADR-0005** (outcome taxonomy, passive-signal weighting, target choice, step/sample gates, selection-bias scope) instead of a separate `research.md`.
- [X] T002 Add **ADR-0005** "Versioned ParameterSets + human-in-the-loop calibration"; supersession sweep run ([[profitability-definition]], [[glossary]]).

---

## Phase 1: Foundational — ParameterSet as the source of scoring truth (blocking)

**⚠️ No calibration/learning can take effect until scoring reads from the active ParameterSet.**

- [X] T003 `ParameterSet` entity + migration (`parameter_sets`) — E1a.
- [X] T004 `ParametersService` — loads/caches the active set, seeds v1 from config on boot — E1a.
- [~] T005 Scoring reads tunables from `ParametersService`: **done** for `scale` (`valuation.service`), soft-flag penalty (`red-flags.ts`), mileage factors (`mileage.ts`) — E1b. **Not** moved: per-profile `minDealScore` (stays on `SearchProfile`), condition weights (still constants; → US3).
- [X] T006 [P] Regression test: valuation output identical at the v1 seed (SC-006) — E1b.

---

## Phase 2: US1 (P1) — Outcome capture (MVP of this feature)

- [X] T007 [US1] `Outcome` entity + migration (`outcomes`) — E2a.
- [X] T008 [US1] `OutcomesService` — record manual (idempotent per opportunity), record passive (dedup), `manualLabeledSince` — E2a.
- [X] T009 [US1] Inline 👍/👎 buttons on both alert types + `/outcome <id> <label> [note]` + `@Action` callback handler — E2b.
- [~] T010 [US1] Passive derivation in the poll: **`price_dropped` done** (E2c). `disappeared`/time-on-market **deferred** (needs the source to distinguish "removed" (404) from "fell out of search").
- [~] T011 [US1] `/report` **realized precision** (👍/👎, 30-day) — **overall done** (E2d); per-profile deferred (needs outcome→opportunity join).
- [~] T012 [P] [US1] Unit tests: idempotency/dedup ✓ (E2a), precision ✓ (E2d), callback encode/parse ✓ (E2b). **Integration test (alert→👍→Outcome) not yet written.**

**Checkpoint**: outcomes accumulate + show up in the report; scoring behavior unchanged.

---

## Phase 3: US2 (P2) — Threshold auto-calibration

- [X] T013 [US2] Pure `threshold-calibration.ts::proposeThreshold(input, target)` — precision rule + volume corridor, bounded ±0.1/run, freeze < 20 scores — E3a.
- [X] T014 [US2] `CalibrationRun` entity + migrations (`calibration_runs`, + `profileId`) — E3a/E3b-2.
- [X] T015 [US2] `CalibrationService`: propose (`proposeThresholdRun`/`proposeAllProfiles`) + **apply/revert** (`applyProposal`/`revert`/`runCalibration`) + **weekly `CalibrationSchedulerService`** (Mon 09:30, mode from config). Threshold apply updates `SearchProfile.minDealScore` (not a ParameterSet); boot no-clobber keeps it. E3b-3.
- [X] T016 [US2] Bot `/calibrate` `/params` `/revert` + `CALIBRATION_MODE`/target config. E3b-3.
- [X] T017 [P] [US2] Unit tests: proposal direction + bounding + freeze (E3a), per-profile runs (E3b-2), apply/no-op + **rollback restore** (E3b-3a).

Prereq done this route: **E3b-1** — `Listing.profileId` (set at evaluation) so scores are per-profile.

**Checkpoint**: threshold self-adjusts (proposed or applied), fully bounded, auditable, reversible.

---

## Phase 4: US3 (P3) — Weight learning (propose-only)

- [X] T018 [US3] Pure `weight-learning.ts::proposeSoftFlagPenalty` — 👎-rate of listings with ≥1 soft flag vs none → bounded ±0.05 penalty tweak (clamped [0.5,1]) + evidence; freeze < 8/group, "no signal" → null. E4a. **Scope: the global soft-flag penalty only** (per-flag / mileage / condition weights are a later refinement).
- [X] T019 [US3] `CalibrationService.proposeWeights` (labeled outcomes → opportunities' redFlags → `SOFT_FLAG_CODES` counts) emits a candidate `ParameterSet` (`ParametersService.createCandidate`); `applyLatestWeightCandidate` → `activate`. Bot `/weights` + `/weights_apply`. E4b.
- [X] T020 [P] [US3] Unit tests: freeze/strengthen/weaken/no-signal/clamp (E4a); `formatWeights` (E4b).

**Checkpoint**: the system recommends explainable weight tweaks with evidence; nothing changes without approval.

---

## Phase 5: Docs & rollout

- [~] T021 Vault kept updated per slice: `overview.md` (calibration module + entities), `glossary.md`
  (ParameterSet, Outcome, CalibrationRun), `profitability-definition.md` (weights versioned), `specs/README`,
  backlog, session log — **ongoing** as slices land.
- [ ] T022 Rollout note in `quickstart`/ops: ship Phase 1+2 (record-only), enable US2 propose-only, watch cycles, then optional bounded auto-apply; US3 stays propose-only in v1.

## Dependencies

- Phase 0 → Phase 1 → Phase 2 (US1) → Phase 3 (US2) → Phase 4 (US3) → Phase 5.
- US2 and US3 both depend on US1 (outcomes) and Phase 1 (active ParameterSet). US1 is independently
  shippable and valuable on its own (auditable alert quality) even if US2/US3 never ship.

## Related

- [spec.md](./spec.md) · [plan.md](./plan.md) · Vault: [[backlog]], [[overview]]
