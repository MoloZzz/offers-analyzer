---
title: SPEC-008 - Cohort market drift correction
type: spec
status: Backlog
updated: 2026-07-27
---

# SPEC-008 - Cohort market drift correction

Backlog-level note for the cohort drift idea captured in `../context/backlog.md` (2026-07-22).
The goal is to project fair value forward to the expected sale date so slowly changing cohorts do
not get underpriced by a stale snapshot.

## Summary

- Input: monthly cohort drift (`drift_mo`) derived from the RIA average-price series.
- Shape: conservative projection layer that sits after SPEC-004's survivorship correction `k`.
- Status: backlog only; no formal Spec Kit spec has been written yet.

## Dependencies

- SPEC-004 for the corrected price anchor.
- SPEC-007 for closed-deal feedback that can validate whether drift matters.

## Related

- [[specs/README]]
