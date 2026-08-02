---
title: Current task handoff
type: context
updated: 2026-08-02
---

# Current task handoff

> Short-lived session handoff. Replace the active-work section when work changes; do not use this
> file as a second roadmap.

## Active work

The portable AI infrastructure kit is implemented (SPEC-013): `ai-infra/` now contains a
versioned copy-and-own second-brain/bootstrap kit with a generic docs-only engine, product/context
templates, safe initializer, and opt-in integration guidance. Offers-specific knowledge, adapters,
and evidence remain in this repository.

The existing scoring, lifecycle, and budget rollout gates remain unchanged: do not activate them
without their stated evidence and operator approval.

## Next pickup

For the next task, read this handoff, use `npm run vault:brief -- "Roadmap & Status"`, then follow
the relevant ADR and repo-root spec links. To adopt the kit elsewhere, start with
`node ai-infra/bin/ai-infra.mjs init --target <path> --project-name "Name" --dry-run`; do not
copy Offers product notes or enable optional integrations by default.

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
