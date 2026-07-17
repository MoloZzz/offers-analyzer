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

---

## Phase 0: Research & decision (blocking design)

- [ ] T001 Write `research.md`: outcome taxonomy, trustworthy passive signals + their weight vs manual, calibration target choice (volume corridor vs precision), per-run step + minimum-sample gate, selection-bias scope.
- [ ] T002 Add **ADR-0005** "Versioned ParameterSets + human-in-the-loop calibration" (`knowledge-offers-analyzer/decisions/`); run the supersession sweep (fixed-constants wording in [[profitability-definition]] / [[glossary]]).

---

## Phase 1: Foundational — ParameterSet as the source of scoring truth (blocking)

**⚠️ No calibration/learning can take effect until scoring reads from the active ParameterSet.**

- [ ] T003 New migration + entity `ParameterSet` (`parameter_sets`: version, active, origin, reason, params jsonb, createdAt) in `src/modules/calibration/entities/`.
- [ ] T004 `ParametersService` in `src/modules/calibration/` — loads the active set, caches it, exposes typed getters, refreshes on change; seeds **v1 from current `configuration.ts`** on first boot.
- [ ] T005 Refactor live scoring to read tunables (`minDealScore` per profile, `SCALE`, red-flag penalties, mileage factors, condition weights) from `ParametersService` — touch `valuation.service`, `mileage.ts`, `red-flags.ts`, `condition.ts`, `query.service`, `poll.service`.
- [ ] T006 [P] Unit test: with the v1 seed, valuation output is **identical** to the pre-refactor constants (SC-006 regression guard).

---

## Phase 2: US1 (P1) — Outcome capture (MVP of this feature)

- [ ] T007 [US1] Migration + entity `Outcome` (`outcomes`: listingId, opportunityId?, source, label, value?, note?, createdAt; manual idempotency + passive dedup constraints) in `src/modules/calibration/entities/`.
- [ ] T008 [US1] `OutcomesService` — record manual outcome (idempotent per opportunity), record passive outcome (dedup), query outcomes by window/profile.
- [ ] T009 [US1] Telegram inline buttons (👍/👎) on opportunity alerts + `/outcome <id> <bought|skipped|resold> [value]` command (Ukrainian) → `OutcomesService`; wire callback handler in `telegram-bot.update`.
- [ ] T010 [US1] Passive-outcome derivation in the poll: mark `disappeared` when a known listing is absent this cycle, `price_dropped` on a drop, capture time-on-market — **no extra source request** (reuse the cycle's data).
- [ ] T011 [US1] Extend the report (R1 `report.ts`) with **realized precision** (👍 vs 👎) over a recent window, per profile + overall.
- [ ] T012 [P] [US1] Unit tests: outcome idempotency/dedup; precision computation. Integration test: alert → 👍 → Outcome stored.

**Checkpoint**: outcomes accumulate + show up in the report; scoring behavior unchanged.

---

## Phase 3: US2 (P2) — Threshold auto-calibration

- [ ] T013 [US2] Pure `calibration.ts`: `proposeThreshold(scores, outcomes, target, bounds)` → per-profile `minDealScore` proposal + projected volume/precision + reason; **freezes** below the minimum labeled-sample gate.
- [ ] T014 [US2] Migration + entity `CalibrationRun` (`calibration_runs`) + persistence of each run (inputs, proposal, applied?, metrics before/after, reason).
- [ ] T015 [US2] `CalibrationService` + weekly scheduler: run `proposeThreshold`; in `propose` mode deliver to the operator (bot accept/reject), in `auto` mode write a new active `ParameterSet` (bounded) and announce.
- [ ] T016 [US2] Config + bot: per-profile target (corridor and/or precision), mode (`propose`/`auto`), and `/calibrate` (run now), `/params` (show active), `/revert` (rollback to prior version).
- [ ] T017 [P] [US2] Unit tests: proposal direction + bounding + freeze gate; rollback restores prior active version.

**Checkpoint**: threshold self-adjusts (proposed or applied), fully bounded, auditable, reversible.

---

## Phase 4: US3 (P3) — Weight learning (propose-only)

- [ ] T018 [US3] Pure `weight-learning.ts`: per named weight, compute a separating statistic from labeled outcomes (e.g. precision lift when a flag fires) → bounded proposed adjustment + evidence; freeze on thin/no-signal.
- [ ] T019 [US3] Extend `CalibrationService` to emit a candidate weight `ParameterSet` (propose-only) with evidence; operator approve/reject via bot → activate or archive.
- [ ] T020 [P] [US3] Unit tests: a signal that separates outcomes yields a bounded increase; a non-separating/thin signal yields no change.

**Checkpoint**: the system recommends explainable weight tweaks with evidence; nothing changes without approval.

---

## Phase 5: Docs & rollout

- [ ] T021 Update the vault: `overview.md` (new `calibration` module + ParameterSet-driven scoring), `glossary.md` (Outcome, ParameterSet, CalibrationRun, realized precision), `profitability-definition.md` (weights now versioned/tunable, not fixed), `specs/README`, backlog; write the session log.
- [ ] T022 Rollout note in `quickstart`/ops: ship Phase 1+2 (record-only), enable US2 propose-only, watch cycles, then optional bounded auto-apply; US3 stays propose-only in v1.

## Dependencies

- Phase 0 → Phase 1 → Phase 2 (US1) → Phase 3 (US2) → Phase 4 (US3) → Phase 5.
- US2 and US3 both depend on US1 (outcomes) and Phase 1 (active ParameterSet). US1 is independently
  shippable and valuable on its own (auditable alert quality) even if US2/US3 never ship.

## Related

- [spec.md](./spec.md) · [plan.md](./plan.md) · Vault: [[backlog]], [[overview]]
