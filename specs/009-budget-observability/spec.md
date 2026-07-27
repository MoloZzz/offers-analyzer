# Feature Specification: Budget Observability and Rollout Guardrails

**Feature Branch**: `009-budget-observability`  
**Created**: 2026-07-28  
**Status**: Draft  
**Input**: SPEC-009 backlog entry and ADR-0009/ADR-0011 rollout gate.

## User Scenarios & Testing

### User Story 1 - Inspect the current budget (Priority: P1)

An operator requests a budget report before changing monitoring work and sees the current daily
and monthly pool, held reserve, remaining spend, actual request use by operation/profile/priority,
and the projected month-end use without causing source requests.

**Why this priority**: The monthly-pool policy is unsafe until the operator can see what is
actually consuming it.

**Independent Test**: Seed recorded budget activity and verify the report reconciles it to the
monthly state and contains no source call.

**Acceptance Scenarios**:

1. **Given** requests have been recorded this month, **When** the operator asks for the budget
   report, **Then** it shows remaining daily/monthly budget, active reserve, run-rate forecast,
   and actual use broken down by operation, profile where applicable, and priority tier.
2. **Given** recorded consumption differs from the monthly aggregate, **When** the report is
   viewed, **Then** it visibly flags the discrepancy and never silently rewrites history.

---

### User Story 2 - Explain deferred work (Priority: P1)

An operator can identify which lower-priority work was refused, why it was refused, and which
profile it belonged to, so starvation is not mistaken for normal lack of listings.

**Independent Test**: Simulate a tier cutoff and exhausted daily budget; verify durable denial
records and the report's deferred-work summary.

**Acceptance Scenarios**:

1. **Given** a request is denied by the daily cutoff, **When** the report is viewed, **Then** it
   identifies the operation, profile (if one exists), tier, and denial reason.
2. **Given** the source has returned a rate-limit response, **When** subsequent work is denied
   during cooldown, **Then** the report identifies the cooldown reason separately from a quota
   denial.

---

### User Story 3 - Assess rollout readiness (Priority: P2)

Before enabling tiered re-checks or another expensive profile, the operator can compare observed
spend to ADR-0009's indicative allocation and see whether the evidence is sufficient to approve a
reforecast.

**Independent Test**: Seed daily activity across the month and verify line-item actuals and
forecasts are visible alongside the indicative allocation.

**Acceptance Scenarios**:

1. **Given** active profiles have collected spend history, **When** the operator views the report,
   **Then** each ADR-0009 allocation line has actual and forecast use for comparison.
2. **Given** history is absent or unreconciled, **When** rollout readiness is evaluated, **Then**
   the report declares the SPEC-005/additional-profile gate not ready.

### Edge Cases

- Shared cohort-average work has no reliable originating profile and is shown as shared, never
  attributed to an arbitrary profile.
- A reserve released in the final three days is reported as released rather than treated as hidden
  recurring capacity.
- A missing or empty activity history produces an explicit no-evidence/not-ready result.

## Requirements

### Functional Requirements

- **FR-901**: Every budget consumption attempt MUST record an immutable event with source,
  operation, priority tier, profile where applicable, attempted cost, outcome, reason, and time.
- **FR-902**: The system MUST attribute search, new-listing detail, re-check detail, sweep, and
  cohort-average work to their semantic operation; shared work MUST be explicitly marked shared.
- **FR-903**: The budget report MUST show daily/monthly remaining capacity, reserve status,
  actual spend, denied/deferred work, and a current run-rate month-end forecast without calling a
  listing source.
- **FR-904**: The report MUST reconcile allowed ledger spend with the monthly pool state and
  visibly surface any mismatch.
- **FR-905**: The report MUST compare actual and projected operation spend with ADR-0009's
  indicative monthly allocation.
- **FR-906**: The report MUST state rollout readiness as not ready until current-month activity
  exists, reconciliation succeeds, and no allocation line is already projected beyond the pool.
- **FR-907**: Existing budget admission rules and source pacing MUST remain unchanged.

### Key Entities

- **Budget activity**: One immutable allowed or denied attempt, with its attribution and reason.
- **Budget report**: Read-only current-month projection, reconciliation, allocation comparison,
  deferred-work summary, and rollout-gate verdict.

## Success Criteria

- **SC-901**: An operator obtains the complete budget report without consuming a source request.
- **SC-902**: For seeded current-month activity, reported allowed spend equals the event sum and
  any difference from aggregate pool use is explicitly displayed.
- **SC-903**: Every denial scenario is identifiable by reason, operation, tier, and profile when
  known.
- **SC-904**: The rollout verdict is reproducible from recorded current-month evidence.

## Assumptions

- Telegram is the v1 operator surface; the report can be compact while retaining the complete
  aggregate data in the application service.
- "Reforecast" here is evidence and a recommendation, not automatic permission to enable
  SPEC-005 or change profile configuration.
- Existing aggregate counters remain the enforcement authority; the event ledger is the audit
  record and reconciliation source.

## Out of Scope

- Automatic profile enablement, reserve policy changes, or automatic budget reallocation.
- Retrofilling detailed attribution for requests spent before SPEC-009.
