---
title: Current task handoff
type: context
updated: 2026-08-02
---

# Current task handoff

> Short-lived session handoff. Replace the active-work section when work changes; do not use this
> file as a second roadmap.

## Active work

The hybrid executable-vault migration is implemented (SPEC-012): the curated hierarchy now has
canonical vision, requirements, invariants, and roadmap owners; generated L1/L2/L3 retrieval and
Offers source facts are available through `npm run vault:*`. Historical backlog content remains
preserved and is promoted only when an item is selected.

## Next pickup

For the next task, read this handoff, use `npm run vault:brief -- "Roadmap & Status"`, then follow
the relevant ADR and repo-root spec links. Do not activate scoring factors, lifecycle rechecks, or
budget expansion without their stated evidence and operator-approval gates.

## Verification / blockers

- `npm run vault:check:strict` and `npm run vault:test` are clean at the implementation baseline.
- Claude hooks are deliberately optional; Codex and other runtimes use the explicit brief/handoff
  protocol. Advisory evidence is dry-validated only and has not queried a database in this task.
- Confirm code and deployment state before acting on a roadmap item. Record concrete work in a new
  dated context/log/ file and promote durable facts before closing the task.
