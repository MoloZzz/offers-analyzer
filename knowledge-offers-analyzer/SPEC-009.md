---
title: SPEC-009 — Budget observability and rollout guardrails
type: spec-backlog
status: Backlog
priority: P0
updated: 2026-07-28
---

# SPEC-009 — Budget observability and rollout guardrails

Backlog-level specification for the verification debt in [[0009-monthly-rate-limit-pool|ADR-0009]].
Promote it through Spec Kit before implementation.

## Goal

Make the 20,000-request monthly pool observable enough to decide whether tiered re-checks or a
new expensive profile can run without starving higher-value work. This is an operational safety
feature, not a dashboard for its own sake.

## Required outcome

- An operator report or dashboard shows actual and projected request spend for the current month,
  broken down by search, new-listing detail, re-check tier, sweep, and cohort averages.
- Every spend line is attributable to a profile where one exists, and to an ADR-0009 priority tier.
- It shows daily/monthly remaining budget, the 15% reserve, deferred/denied work, and the forecast
  month-end usage at the current run rate.
- Before enabling SPEC-005 or another expensive profile, the operator can compare real counts with
  ADR-0009's indicative allocation and approve an explicit reforecast. Reserve cannot silently
  become permanent operating capacity.
- The report consumes no AUTO.RIA requests and retains enough history to explain an exhausted
  budget after the fact.

## Acceptance criteria

1. A daily view reconciles recorded consumption with the monthly state; a discrepancy is visible
   rather than silently corrected.
2. A profile or priority tier that consumes more than its approved forecast is identifiable.
3. The operator can see which lower-priority work was deferred because of the daily cutoff.
4. SPEC-005 is blocked in the rollout checklist until this evidence exists for the active profiles.

## Related

- [[0009-monthly-rate-limit-pool|ADR-0009]] · [[0011-evidence-gated-scoring-rollout|ADR-0011]]
- [[backlog]] · [[SPEC-005]]
