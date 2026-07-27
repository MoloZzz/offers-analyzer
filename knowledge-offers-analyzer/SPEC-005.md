---
title: SPEC-005 - Listing lifecycle and tiered re-check
type: spec
updated: 2026-07-28
---

# SPEC-005 - Listing lifecycle and tiered re-check

Backlog-level note for the listing lifecycle and tiered re-check work captured in
`context/backlog.md`.

## Summary

- Re-check listings that are close to the configured deal threshold so later price cuts can
  trigger a re-score and a repeat alert.
- Prioritize checks by score distance, days on market, and recorded price cuts.
- Status: backlog only; create a formal Spec Kit specification before implementation.

## Dependencies

- [[0009-monthly-rate-limit-pool|ADR-0009]] funds the re-check request budget.
- `SPEC-004` provides disappearance tracking that removes no-longer-active listings.

## Related

- [[specs/README]]
- [[backlog]]
