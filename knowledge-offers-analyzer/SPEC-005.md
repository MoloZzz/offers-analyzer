---
title: SPEC-005 - Listing lifecycle and tiered re-check
type: spec
updated: 2026-08-02
---

# SPEC-005 - Listing lifecycle and tiered re-check

Curated pointer to the formal Spec Kit package at
`../../specs/005-listing-lifecycle-rechecks/`.

## Summary

- Re-check listings that are close to the configured deal threshold so later price cuts can
  trigger a re-score and a repeat alert.
- Prioritize checks by score distance, days on market, and recorded price cuts.
- Status: formalized 2026-07-28; implementation is pending the SPEC-009 live budget-evidence gate
  and explicit operator approval.

## Dependencies

- [[0009-monthly-rate-limit-pool|ADR-0009]] funds the re-check request budget.
- `SPEC-004` provides disappearance tracking that removes no-longer-active listings.
- [[0011-evidence-gated-scoring-rollout|ADR-0011]] gates production enablement.

## Related

- [[specs/README]]
- [[Roadmap & Status]]
