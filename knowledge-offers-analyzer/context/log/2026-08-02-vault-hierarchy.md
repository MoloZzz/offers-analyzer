---
title: Vault hierarchy migration
type: context-log
date: 2026-08-02
updated: 2026-08-02
---

# Vault hierarchy migration

## Intent

Move durable product intent and delivery status out of the broad context entry point without
deleting historical planning material.

## Changed

- Added curated business vision and requirements notes.
- Added architecture and operational invariants.
- Added a canonical Roadmap & Status note.
- Reduced context/goals.md to session orientation and added context/CURRENT.md.
- Added a reusable session-log template and marked context/backlog.md as retained historical
  queue during migration.

## Decisions and promotions

- No product or architecture decision changed; existing ADRs remain authoritative.
- Durable intent is now owned by business/vision-and-goals.md.
- Durable requirements and delivery status are owned by business/requirements.md and
  Roadmap & Status.md respectively.

## Verification

- npm.cmd run vault:check passed with 0 warnings.
- node tools/vault/v.mjs check found no errors; the only remaining warnings are the six missing
  generated _gen artifacts, which are created by the explicit vault build step.

## Next handoff

- Promote an active backlog item only when it is selected for work; keep its history and links
  intact until then.
- Align the feature-spec index with the new canonical roadmap as part of its separate SDD
  governance update.

## Related

- [[00-INDEX]]
- [[Roadmap & Status]]
- [[vision-and-goals]]
