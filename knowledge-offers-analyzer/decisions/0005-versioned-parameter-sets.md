---
title: ADR-0005 — Versioned ParameterSets + human-in-the-loop calibration
type: decision
status: Accepted
updated: 2026-07-17
---

# ADR-0005 — Versioned ParameterSets + human-in-the-loop calibration

**Status:** Accepted
**Date:** 2026-07-17

## Context

Spec 002 (`specs/002-auto-calibration-learning/`) closes the feedback loop: capture outcomes, then
auto-calibrate the alert threshold and eventually learn the scoring weights. For any automatic change to
take effect — and to stay safe — the scoring parameters must be (a) changeable at runtime without a
redeploy, (b) fully auditable, and (c) instantly reversible. Today the tunables (`minDealScore`, `SCALE`,
red-flag penalties, mileage factors, condition weights) are hard-coded constants / env config read at
boot — not changeable, versioned, or reversible. We also want to avoid a black-box ML model
(constitution §III: clean, simple, explainable).

## Decision

1. **Scoring reads its tunables from a single active, versioned `ParameterSet`** (a row in
   `parameter_sets`, `params` jsonb), not from constants. Exactly one version is `active`; live scoring
   (poll + `/check`) reads it via a cached `ParametersService`. **v1 is seeded from the current config so
   behavior is byte-for-byte unchanged** (spec SC-006).
2. **Every change is a new version, never an in-place edit.** Rollback = re-activate a prior version
   (one action). Each version carries `origin` (`manual`|`calibration`), a `reason`, and timestamp.
3. **Human-in-the-loop by default.** Calibration/learning *proposes*; auto-apply is opt-in per capability
   and bounded per run. All changes are recorded in `calibration_runs` (inputs, proposal, applied?,
   metrics before/after).
4. **Transparent, bounded, stored-data-only.** Rule-based / simple statistics over explainable
   parameters — no ML model; every auto-change is clamped; learning spends **zero** AUTO.RIA budget and
   **freezes** below a minimum labeled-sample count.

Migrations are append-only (project rule): new tables `parameter_sets`, `outcomes`, `calibration_runs`.

## Consequences

**Positive:** scoring becomes tunable at runtime, auditable, and reversible; enables self-calibration
without sacrificing explainability or safety; the seam is easy to unit-test (identical output at v1).

**Negative / trade-off:** one added indirection — scoring no longer reads constants directly but goes
through `ParametersService` (cached). A refactor of the valuation seam is required (Phase E1), guarded by
a regression test asserting identical output at the seeded v1.

**Supersession:** the notion that scoring weights are *fixed constants* is now historical — the
[[profitability-definition]] and [[glossary]] descriptions are updated to say the weights live in a
versioned ParameterSet (fixed only at v1). Supersession sweep run when E1 lands.

## Related
- [[decisions/README]] · spec 002 · [[profitability-definition]] · [[backlog]] · [[overview]]
