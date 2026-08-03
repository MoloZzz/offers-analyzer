---
title: Current task handoff
type: context
updated: 2026-08-02
---

# Current task handoff

> Short-lived session handoff. Replace the active-work section when work changes; do not use this
> file as a second roadmap.

## Active work

SPEC-015, Defensible valuation evidence, is implemented at
`specs/015-defensible-valuation-evidence/`. It adds an official AUTO.RIA AI provider-evidence path
for the target `active_listing_ask`, but only as disabled-by-default shadow mode. The code includes
typed provider/source facts, immutable redacted evidence/policy records, dedicated `valuation_ai`
budget allocation, source-free `/why`, and admin-only `/valuation_audit`.

The existing scoring, lifecycle, and budget rollout gates remain unchanged. The implementation did
not apply its additive migration, ship credentials, make source traffic, or change fair value,
score, alert, threshold, ParameterSet, factor, or survivorship correction `k`.

## Next pickup

For the next task, read this handoff and `specs/015-defensible-valuation-evidence/quickstart.md`.
Confirm official AUTO.RIA AI permission, allowed storage/attribution, effective pricing/allocation,
and sanitized fixture parity before enabling any provider request. On an operator-approved
development database, apply and regenerate the additive migration to verify no schema churn. Then
collect the pending gold-case strata and review `/valuation_audit`. Do not promote active-listing
evidence to a resale model or change the live score without a separate approved decision.

## Verification / blockers

- Completed on 2026-08-02 (native Windows `npm.cmd` through RTK): `typecheck`, `lint`, full Jest
  (309 tests), contract Jest (23 tests), Nest build, `vault:build`, `vault:check:strict`, and
  `vault:test` all pass.
- The remaining blockers are external/operator gates only: approved provider credentials/terms and
  allocation, a development migration apply/re-generation check, pending gold-case captures, and
  the `/valuation_audit` review. Leave `AUTO_RIA_AI_ENABLED=false` until those gates are complete.
- `npm run ai-infra:test` covers a docs-only target, dry-run/apply, collision safety, installed
  doctor, generic retrieval, and write-free strict validation.
- Claude hooks are deliberately optional; Codex and other runtimes use the explicit brief/handoff
  protocol. The optional PostgreSQL evidence extension is documentation only and did not query a
  database in this task.
- Confirm code and deployment state before acting on a roadmap item. Record concrete work in a new
  dated context/log/ file and promote durable facts before closing the task.
