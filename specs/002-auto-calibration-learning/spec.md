# Feature Specification: Auto-Calibration & Outcome-Based Learning

**Feature Branch**: `002-auto-calibration-learning`

**Created**: 2026-07-17

**Status**: Draft

**Input**: User description: "Close the feedback loop: capture what actually happened to flagged listings, then use that to auto-calibrate the alert threshold and gradually tune the scoring weights, so the system improves its own selection over time — documented, staged, transparent."

## Context & Problem

Today the valuation is a fixed rule-based formula (`discount × confidence × penalty`) with hand-set
constants (`SCALE`, red-flag penalties, mileage factors, condition keyword weights) and an operator-set
`minDealScore`. The `/report` digest (spec 001 follow-up) *recommends* a threshold, but nothing is
applied automatically and the system never learns from results — because **we never record what
actually happened** to the cars we flagged. This feature closes that loop.

**Hard truth this spec must respect — partial labels / selection bias.** We only observe outcomes for
listings we alerted on (and that the operator reacted to). We have almost no signal on listings we did
*not* alert (false negatives). So "learning" here is deliberately scoped to what partial labels can
support: improving *precision* on the alerted set, using near-misses and passive lifecycle signals to
approximate recall — not a general-purpose model that assumes complete labels.

## Guiding constraints (non-negotiable)

- **Transparent, not black-box.** Rule-based / simple-statistics tuning of explainable parameters — no
  opaque ML model (constitution: clean, simple, explainable). Every change must be inspectable.
- **Bounded & reversible.** Every auto-change is clamped to a safe range and is a new *versioned*
  parameter set, so any change can be rolled back instantly.
- **Human-in-the-loop by default.** The system *proposes*; auto-apply is opt-in per capability and
  always bounded.
- **No extra API budget.** Learning runs on *stored* data (evaluations, snapshots, outcomes). It must
  not spend AUTO.RIA request budget.
- **Fails safe on thin data.** Below a minimum sample size it does nothing (freezes), never overfits.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Capture what happened (feedback) (Priority: P1)

The operator can tell the system the outcome of a flagged listing — a quick reaction on the alert
(👍 good call / 👎 bad call, or "купив / пропустив / перепродав за X") — and the system also passively
records lifecycle signals it can already see (price dropped, listing disappeared → likely sold, time on
market). These labeled outcomes accumulate as the ground truth everything else learns from.

**Why this priority**: Nothing downstream can calibrate or learn without outcomes. On its own it already
delivers value: an auditable record of how good the alerts were, and the inputs for a real precision
metric. It is the MVP of this feature.

**Independent Test**: React to an alert in Telegram and confirm an Outcome row is stored linked to that
opportunity; let a known listing disappear between cycles and confirm a passive "gone" outcome is
recorded — with no effect yet on scoring.

**Acceptance Scenarios**:

1. **Given** an alert was sent, **When** the operator taps 👍/👎 (or replies "купив"/"пропустив"), **Then** exactly one Outcome is stored for that opportunity with the label, source=`manual`, and timestamp (idempotent — repeated taps update, don't duplicate).
2. **Given** a known listing seen last cycle, **When** it is absent from the source this cycle, **Then** a passive Outcome `disappeared` is recorded (candidate signal for "sold"), without inferring it was a good deal.
3. **Given** feedback exists, **When** the operator runs a report, **Then** it shows realized precision on the alerted set (👍 vs 👎) alongside the existing distribution.

---

### User Story 2 — Auto-calibrate the alert threshold (Priority: P2)

A periodic calibration job proposes (and, if the operator enabled auto-apply, applies) a new
`minDealScore` per profile — steering toward a target the operator sets: either a **candidate-volume
corridor** (e.g. 5–15 alerts/week) or a **minimum realized precision** (e.g. ≥70% 👍 on recent
feedback). Every change is bounded per run and recorded as a new parameter version with a reason.

**Why this priority**: This is the first *self-improving* behavior and the lowest-risk one (one scalar,
per profile, easily bounded and reversed). It turns the `/report` suggestion from advice into an
optional automatic adjustment.

**Independent Test**: Seed stored evaluations + outcomes so the current threshold is clearly too low
(too many low-quality alerts), run calibration, and confirm it proposes a higher `minDealScore` within
the per-run cap, with a recorded reason and a before/after metric — and that auto-apply writes a new
active parameter version while propose-only leaves the active one unchanged.

**Acceptance Scenarios**:

1. **Given** a volume corridor of 5–15/week and 40 alerts last week, **When** calibration runs, **Then** it proposes raising `minDealScore` by ≤ the per-run step, toward the corridor, and records the projected new volume.
2. **Given** realized precision below the target and enough labeled outcomes, **When** calibration runs, **Then** it proposes a stricter threshold; **Given** fewer than the minimum labeled outcomes, **Then** it proposes nothing (freeze) and says why.
3. **Given** auto-apply is off, **When** calibration proposes a change, **Then** the active parameters are unchanged and the proposal is delivered to the operator to accept/reject; **Given** auto-apply is on, **Then** a new active `ParameterSet` version is written and the change is announced.
4. **Given** any applied change, **When** the operator asks to revert, **Then** the previous parameter version is reactivated (full rollback).

---

### User Story 3 — Learn the scoring weights (Priority: P3)

Beyond the single threshold, the system periodically proposes small, bounded adjustments to the
explainable scoring weights — red-flag penalty strength, mileage-correction factor, and condition
keyword weights — from accumulated outcomes, so the *ranking* improves, not just the cutoff. Starts as
simple statistics (which signals actually separated 👍 from 👎), always bounded, versioned, and
human-approved before taking effect.

**Why this priority**: Highest value but highest risk and most data-hungry, so it comes last and stays
proposal-only for longer. It builds directly on the outcomes (US1) and the calibration machinery (US2).

**Independent Test**: Given a labeled outcome set where, say, the "needs-repair" description flag
strongly predicts 👎, run weight learning and confirm it proposes increasing that flag's penalty within
bounds, with the supporting statistic shown, and that nothing changes until the operator approves.

**Acceptance Scenarios**:

1. **Given** a signal that empirically separates good from bad outcomes, **When** weight learning runs with enough data, **Then** it proposes a bounded adjustment to that signal's weight with the evidence (e.g. precision lift), as a new candidate `ParameterSet`.
2. **Given** a signal with no separating power or too little data, **When** it runs, **Then** it proposes no change for that weight (freeze).
3. **Given** a proposed weight set, **When** the operator approves it, **Then** it becomes the active version; **When** rejected, **Then** the active version is untouched and the proposal is archived.

---

### Edge Cases

- **Selection bias / partial labels**: we only see outcomes for alerted listings → calibration optimizes *precision* on that set and uses near-misses/passive signals as a *proxy* for recall; the spec explicitly does not claim to fix false negatives it can't observe.
- **Sparse or conflicting feedback**: below the minimum labeled-sample threshold, learning freezes; conflicting labels on the same car take the latest manual one.
- **Concept drift**: the market shifts (season, FX, war-driven supply) → calibration uses a recent window and can move again next run; bounds prevent overreaction to a single week.
- **Passive-signal ambiguity**: "disappeared" ≠ "sold at a good price" → passive signals are weak evidence, weighted below manual labels and never treated as confirmed profit.
- **Gaming / feedback loops**: bounded per-run steps + versioning + rollback prevent runaway drift; auto-apply is opt-in and capped.
- **Cold start**: with no outcomes, US2/US3 propose nothing and the system behaves exactly as today.
- **Multi-profile**: thresholds calibrate per profile; shared weights (SCALE, penalties, mileage, condition) are global and change more conservatively.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST record an **Outcome** for a listing/opportunity, with `source` (`manual` | `passive`), a `label`, an optional note, and a timestamp; manual outcomes MUST be idempotent per (opportunity, operator).
- **FR-002**: System MUST let the operator submit a manual outcome directly from an alert (inline buttons) and via a bot command, in Ukrainian.
- **FR-003**: System MUST derive **passive outcomes** from data it already has (price drop, listing disappeared, time-on-market) without spending source request budget.
- **FR-004**: System MUST compute and expose **realized precision** (👍 vs 👎) over a recent window, per profile and overall, in the report.
- **FR-005**: System MUST store scoring configuration as **versioned ParameterSets** (threshold defaults, `SCALE`, red-flag penalties, mileage factors, condition weights), with exactly one active version, and MUST let the operator roll back to any prior version.
- **FR-006**: A **calibration run** MUST propose a per-profile `minDealScore` toward an operator-set target (volume corridor and/or minimum precision), bounded by a per-run maximum step, and MUST record inputs, proposal, projected effect, and reason.
- **FR-007**: System MUST support **propose-only** and **auto-apply** modes per capability (threshold, weights); auto-apply MUST write a new active ParameterSet and announce the change; propose-only MUST leave the active set unchanged and deliver the proposal for accept/reject.
- **FR-008**: **Weight learning** MUST propose only bounded, explainable adjustments to named weights, each justified by a stored statistic, and MUST default to propose-only.
- **FR-009**: All learning/calibration MUST **freeze** (propose nothing) when the relevant labeled-sample count is below a configured minimum, and MUST say so.
- **FR-010**: System MUST NOT consume AUTO.RIA request budget for any calibration/learning work (stored-data only).
- **FR-011**: Every applied change MUST be **auditable** (who/what/when/why: `manual` operator vs `calibration` job, before/after, metrics) and **reversible**.
- **FR-012**: The active ParameterSet MUST drive live scoring (poll + `/check`) so calibration actually takes effect, without a redeploy.

### Key Entities *(include if feature involves data)*

- **Outcome**: the realized result for a listing/opportunity — `source` (manual/passive), `label` (e.g. good/bad, bought/skipped/resold, disappeared/price_dropped), optional value/note, timestamp. The ground truth.
- **ParameterSet**: a versioned, named bundle of all tunable scoring parameters; one active at a time; carries origin (`manual`/`calibration`), reason, created-at. Enables live tuning + rollback.
- **CalibrationRun**: a record of one calibration/learning pass — window, inputs summary, proposed changes, applied?, metrics before/after, reason.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After enabling feedback, ≥ 80% of alerts the operator engages with produce a stored Outcome, and the report shows realized precision.
- **SC-002**: With calibration on (any mode), the weekly candidate volume moves into and stays within the operator's corridor within 4 calibration cycles, without oscillating outside it.
- **SC-003**: Realized precision on the alerted set is **non-decreasing** over a rolling 8-week window after calibration is enabled (no regression vs the fixed-threshold baseline).
- **SC-004**: 100% of automated changes are versioned, reason-tagged, and reversible in one action; a rollback restores prior behavior exactly.
- **SC-005**: Zero AUTO.RIA requests are attributable to calibration/learning.
- **SC-006**: With no outcomes present, behavior is byte-for-byte the current system (safe cold start).

## Assumptions

- The operator (a small, trusted user set) provides at least occasional manual feedback; the system stays useful with sparse feedback by freezing learning rather than guessing.
- Passive signals (disappeared, price drop, time-on-market) are weak proxies, not confirmed sales, and are weighted accordingly.
- The existing rule-based scoring (spec 001 + the mileage/condition/report follow-ups) stays the substrate; this feature tunes its parameters, it does not replace it with a model.
- PostgreSQL remains the store; migrations are append-only (project rule); no new external services.
- "Learning" targets precision on the alerted set; recall on never-alerted listings is out of scope for v1 (unobservable).

## Out of scope (v1)

- Black-box / heavy ML models; per-listing probability models requiring complete labels.
- Cross-source learning (only AUTO.RIA data exists today).
- Automatic editing of niche *definitions* (region/make/model) — only scoring parameters are tuned.

## Related

- Builds on spec 001 (profitable-listing-alerts) and its follow-ups (mileage M1/M2, condition C, report R1).
- Vault: [[profitability-definition]], [[why-no-opportunities]], [[overview]], [[backlog]].
