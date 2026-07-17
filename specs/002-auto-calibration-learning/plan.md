# Implementation Plan: Auto-Calibration & Outcome-Based Learning

**Branch**: `002-auto-calibration-learning` | **Date**: 2026-07-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-auto-calibration-learning/spec.md`

## Summary

Close the feedback loop on the existing rule-based scorer. Capture **Outcomes** (manual reactions on
alerts + passive lifecycle signals), store all tunable scoring parameters as **versioned
ParameterSets** with one active version driving live scoring, and add a stored-data-only
**calibration/learning** job that *proposes* (optionally auto-applies) bounded, reversible changes:
first the per-profile `minDealScore` (US2), then the explainable scoring weights (US3). Everything is
transparent, human-in-the-loop by default, freezes on thin data, and spends zero API budget.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS (unchanged).

**Primary Dependencies**: existing stack only — NestJS 10, TypeORM + `@nestjs/typeorm`, `pg`,
`@nestjs/schedule` (cron), `nestjs-telegraf` (inline buttons for feedback), `@nestjs/config`. **No new
runtime dependency, no ML library** (constitution III: simple + explainable).

**Storage**: PostgreSQL. New tables `outcomes`, `parameter_sets`, `calibration_runs` (append-only
migrations). The active `ParameterSet` is cached in memory and refreshed on change.

**Testing**: Jest. Pure functions for the calibration math and weight statistics are the primary test
target (deterministic, no IO); a small integration test for the feedback → outcome path.

**Target Platform / Project Type**: unchanged (single NestJS backend, Telegram bot UI).

**Performance Goals**: a calibration run completes in seconds over stored rows; never blocks the poll;
never issues a source request.

**Constraints**: bounded per-run step; versioned + reversible; propose-only default; freeze below
minimum labeled samples; zero AUTO.RIA budget; secrets in env; append-only migrations.

**Scale/Scope**: v1 = a few profiles, low tens of thousands of listings/outcomes — trivially handled by
SQL aggregates.

## Constitution Check

*GATE: must pass before design; re-checked after.*

| Principle | Gate | Status |
|---|---|---|
| I. Spec-Driven Development | This plan traces to spec FR-001…FR-012 | ✅ Pass |
| II. Knowledge Base is source of truth | Design + ADR promoted to the vault on completion | ✅ Pass (on completion) |
| III. Clean, Simple, Explainable | Rule-based / simple statistics; **no black-box ML**; bounded, versioned, reversible | ✅ Pass |
| IV. Ports & Adapters | Reuses existing ports; calibration is a pure domain service + a scheduler | ✅ Pass |
| V. Respect External Limits & Legality | Stored-data only → **zero** API budget spent (FR-010) | ✅ Pass |
| VI. Test What Matters | Pure calibration/statistics fns unit-tested; feedback path integration-tested | ✅ Pass |
| VII. Token-Efficient Tooling (RTK) | All dev commands via RTK | ✅ Pass |

**New decision → ADR required**: introducing versioned, self-adjusting scoring parameters is a
non-trivial architectural change → add **ADR-0005 "Versioned ParameterSets + human-in-the-loop
calibration"** during implementation, and run the supersession sweep ( [[profitability-definition]]
currently states weights as fixed constants ).

## Data Model

*New tables (append-only migrations; one migration per change).*

- **`outcomes`** — `id`, `listingId` (fk), `opportunityId` (fk, nullable), `source` (`manual`|`passive`),
  `label` (enum: `good`|`bad` and/or `bought`|`skipped`|`resold`|`price_dropped`|`disappeared`),
  `value` (numeric, nullable — e.g. resale price), `note` (text, nullable), `createdAt`.
  Unique on (`opportunityId`, `source`, operator) for manual idempotency; passive rows dedup on
  (`listingId`, `label`).
- **`parameter_sets`** — `id`, `version` (int, monotonic), `active` (bool, exactly one true),
  `origin` (`manual`|`calibration`), `reason` (text), `params` (jsonb: `minDealScoreByProfile`,
  `scale`, `redFlagPenalty`, `mileageAnnualK`/`per10kPct`/`maxAdjPct`, `conditionWeights`), `createdAt`.
  Live scoring reads the active set; rollback = flip `active` to a prior version.
- **`calibration_runs`** — `id`, `ranAt`, `window` (text), `mode` (`propose`|`auto`), `capability`
  (`threshold`|`weights`), `inputsSummary` (jsonb), `proposal` (jsonb), `applied` (bool),
  `metricsBefore`/`metricsAfter` (jsonb), `reason` (text).

Relationships: `Outcome` → `Listing`/`Opportunity`; `CalibrationRun` produces a candidate/active
`ParameterSet`. No change to `Listing`/`Opportunity` beyond the new FKs.

## Design & Phasing

Delivered as independently shippable slices matching the user stories.

### Phase 0 — Research / decisions (write into research.md + ADR-0005)

- Outcome taxonomy + which passive signals are trustworthy and their weight vs manual labels.
- Calibration target: **volume corridor** vs **precision target** (support both; operator picks per
  profile). Choose the per-run max step and the minimum labeled-sample gate.
- Parameter versioning + active-set caching + live refresh mechanism.
- Confirm the selection-bias scope (precision on alerted set; near-misses/passive as recall proxy).

### Phase 1 — Foundational: ParameterSet as the source of scoring truth (blocking)

Refactor live scoring to read tunables from the **active ParameterSet** instead of `configuration.ts`
constants (seed v1 from current config so behavior is unchanged — SC-006). This unblocks any automatic
change taking effect (FR-012). New `parameter_sets` table + `ParametersService` (active-set cache +
refresh). Pure, well-tested seam.

### Phase 2 — US1 (P1): Outcome capture

`outcomes` table + `OutcomesService`. Telegram inline buttons (👍/👎) on each alert + a bot command
(`/outcome <id> …`); passive derivation during the poll (disappeared/price-drop/time-on-market) with no
extra requests. Extend the report (R1) with realized precision. **MVP of this feature.**

### Phase 3 — US2 (P2): Threshold auto-calibration

Pure `calibration.ts` (given scores + outcomes + target + bounds → proposed per-profile
`minDealScore` + projected effect + reason). `CalibrationService` + weekly scheduler that writes a
`CalibrationRun` and, per mode, either delivers a proposal (accept/reject via bot) or writes a new
active `ParameterSet`. Rollback command.

### Phase 4 — US3 (P3): Weight learning (propose-only first)

Pure `weight-learning.ts`: for each named weight, compute a separating statistic from labeled outcomes
(e.g. precision lift when a flag fires) → bounded proposed adjustment with evidence. Emits a candidate
`ParameterSet` for operator approval. Auto-apply stays off until trust is established.

### Rollout / safety

Ship Phase 1+2 first (record only, no behavior change). Enable US2 in **propose-only**, watch a few
cycles, then optionally auto-apply within tight bounds. US3 stays propose-only in v1.

## Complexity / risk tracking

- **Selection bias** (spec) — mitigated by scoping to precision + treating passive signals as weak.
- **Feedback-loop instability** — bounded per-run step, versioning, one-action rollback, freeze gate.
- **Parameter refactor risk** — Phase 1 seeds from current config and is covered by the existing
  valuation tests plus new ones asserting identical output at v1 (SC-006).

## Related

- Spec: [spec.md](./spec.md) · Tasks: [tasks.md](./tasks.md)
- Vault: [[profitability-definition]], [[overview]], [[backlog]], [[decisions/README]] (ADR-0005)
