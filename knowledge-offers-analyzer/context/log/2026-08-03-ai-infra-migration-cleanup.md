---
title: ai-infra migration cleanup
type: context-log
date: 2026-08-03
updated: 2026-08-03
---

# ai-infra migration cleanup

## Intent

`ai-infra/` was removed from the repository in `a1df401` ("ai: migrate universal part to other
repo"). The open question was whether this project still needs it, or whether every instrument —
second brain with auto layers, product-vision loop, context control — is already present and
working here. Answer: the kit was a redistribution artifact for *other* repositories and is not
needed here. But the removal left two loose ends that this task closed.

## Changed

- `package.json` — deleted the `ai-infra:test` script (pointed at deleted paths, exited 1).
- `.github/workflows/quality.yml` — deleted the `npm run ai-infra:test` step. It sat before
  `vault:check:strict`, `typecheck`, `lint`, and both Jest runs, so CI failed on every push to
  `main` and every PR without reaching any later gate.
- [[0016-portable-ai-infra-kit|ADR-0016]] — added an "Update — 2026-08-03" section resolving
  decision point 6 (standalone repository) and recording the new home.
- [[overview|architecture/overview]], [[environment-setup]], `context/CURRENT.md`,
  `specs/README.md` — repointed at <https://github.com/MoloZzz/ai-support-system>; they still
  described `ai-infra/` as living in this repository.

## Decisions and promotions

- Decision: the kit stays external and is not re-vendored. `tools/vault/` is a **superset** of what
  `ai-infra/engine/` packaged — it additionally owns `lib/evidence.mjs` and
  `adapters/offers-nest-typeorm.mjs`, which the kit deliberately excluded. Nothing was lost.
- Coverage confirmed present and green: second brain + L1-L4 retrieval (`tools/vault/`,
  `knowledge-offers-analyzer/`, `_gen/`), product-vision loop (`business/`, `Roadmap & Status.md`,
  `.specify/`), context control (`context/`), evidence (`_metrics.tsv`, `lib/evidence.mjs`), RTK.
- ADR-0016 keeps status Accepted and spec 013 is retained as history; neither is deleted, since
  both record decisions that were genuinely made.

## Verification

- Commands (native Windows `npm`; RTK's binary is Linux/musl and cannot run in this runtime — the
  CLAUDE.md §3 fallback): `vault:test`, `vault:check:strict`, `vault:brief`, then `vault:build` and
  `vault:check:strict` again after the note edits.
- Result: `vault:test` 15/15 pass; `vault:check:strict` 0 errors / 0 warnings; `vault:brief`
  renders L1. `npm run ai-infra:test` reproduced the CI failure before removal.

## Observation worth keeping

`vault:check:strict` passed the whole time the notes described a directory that no longer existed.
The check validates links, frontmatter, and graph structure — not whether a note's claims about the
filesystem still hold. Filesystem-claim drift is caught only by the CLAUDE.md §1 supersession
sweep, which is manual. Worth remembering before trusting a green check as proof the vault matches
reality.

## Next handoff

- Next action: none for this thread. Active work remains SPEC-015 per `context/CURRENT.md`.
- Blocker or evidence needed: none.

## Related

- [[0016-portable-ai-infra-kit|ADR-0016]]
- [[0015-hybrid-executable-vault|ADR-0015]]
- [[environment-setup]]
- [[00-INDEX]]
