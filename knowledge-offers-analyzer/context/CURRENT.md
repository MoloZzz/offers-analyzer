---
title: Current task handoff
type: context
updated: 2026-08-02
---

# Current task handoff

> Short-lived session handoff. Replace the active-work section when work changes; do not use this
> file as a second roadmap.

## Active work

SPEC-015, Defensible valuation evidence, is now specified and planned at
`specs/015-defensible-valuation-evidence/`. It introduces an official AUTO.RIA AI provider
evidence path for the target `active_listing_ask`, but only in disabled-by-default shadow mode.
No application code, migration, source traffic, score, alert, threshold, ParameterSet, factor, or
survivorship correction `k` changed while planning it.

The existing scoring, lifecycle, and budget rollout gates remain unchanged. Any provider enablement
needs approved credentials/retention terms, contract fixtures, feature allocation, source-parity
audit, and a later operator-approved activation decision.

## Next pickup

For the next task, read this handoff, use `npm run vault:brief -- "Roadmap & Status"`, then begin
with T001 in `specs/015-defensible-valuation-evidence/tasks.md`. Confirm official AUTO.RIA AI
permission, allowed storage/attribution, effective pricing/allocation, and sanitized fixtures
before enabling any provider request. Do not promote active-listing evidence to a resale model or
change the live score without a separate approved decision.

## Verification / blockers

- `npm run vault:check:strict` and `npm run vault:test` remain clean at the implementation
  baseline.
- `npm run ai-infra:test` covers a docs-only target, dry-run/apply, collision safety, installed
  doctor, generic retrieval, and write-free strict validation.
- Claude hooks are deliberately optional; Codex and other runtimes use the explicit brief/handoff
  protocol. The optional PostgreSQL evidence extension is documentation only and did not query a
  database in this task.
- Confirm code and deployment state before acting on a roadmap item. Record concrete work in a new
  dated context/log/ file and promote durable facts before closing the task.
