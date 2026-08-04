---
title: Retrieval discipline — why a planning query cost 135k tokens
type: context-log
updated: 2026-08-04
---

# Retrieval discipline — why a planning query cost 135k tokens

## Intent

Operator reported that `what is the next task to implement` consumed ~135.5k tokens, and suspected
the AI infrastructure was broken — specifically that specs and a roadmap sitting "in the root
directory" were structural drift. Two questions: is the layout wrong, and why is a cheap question
expensive?

## Changed

- `CLAUDE.md` §1 — added a trigger-conditional rule: planning questions stop at L3; `Roadmap &
  Status`, `context/CURRENT.md`, `_gen/code-map.txt` are authoritative; escalation to L4 requires a
  stated reason given *before* the first source read; `/status` is the standard path.
- `CLAUDE.md` §3 — Cowork fallback corrected from bare `rtk` to `tools/rtk`.
- `operations/environment-setup.md` — documented that `rtk` is not on `PATH` in Cowork and must be
  invoked by path; noted each Cowork shell call is a fresh process so `PATH` cannot be persisted.
- `.claude/skills/status/SKILL.md` — **new**. Fixed retrieval path for status/roadmap/prioritization
  questions with hard rules against reading `src/` or grepping for planning answers.
- `decisions/0021-retrieval-discipline-by-default.md` — **new ADR**, indexed in `decisions/README`.

## Decisions and promotions

- **Decision:** enforce retrieval discipline via mechanism (a fixed `/status` path, a
  question-class trigger, a declared-escalation rule) rather than by adding more prose telling the
  agent to be economical. Recorded as [[0021-retrieval-discipline-by-default|ADR-0021]].
- **Rejected alternative** (recorded in the ADR so it is not re-proposed): a 350-word "Information
  Acquisition Policy" block for `CLAUDE.md` with a preferred-source ladder and per-step
  "Information ROI" self-assessment. Its core sentence already exists verbatim at
  `_meta/vault-protocol.md:14`; it would grow the always-on instruction budget ~38%; its
  self-assessment loop is evaluated by the same estimator that caused the error; and its
  "minimize acquisition" objective scores a zero-tool-call answer as optimal — which is exactly
  the *other* failure observed in the same investigation.

## Verification

- Measured, not assumed: `vault:brief -- "Roadmap & Status"` → 166 lines / 9.8KB (~2.4k tokens),
  includes the `Next` section. `vault:find "next task"` → 3 lines, resolves correctly. **The
  retrieval layer is working as designed.**
- `src/**/*.ts` ≈ 493KB ≈ ~123k tokens — close to the whole reported 135.5k on its own, which
  identifies broad source exploration as the likely bulk. `_gen/code-map.txt` (17.8KB) is its
  maintained ~25x cheaper substitute.
- Root layout complaint **disproved**: `specs/` at repo root is Spec-Kit's own hardcoded target
  (`SPECS_DIR="$REPO_ROOT/specs"` in `.specify/scripts/bash/create-new-feature.sh`), and
  `Roadmap & Status.md` is *not* at repo root — it is inside `knowledge-offers-analyzer/`, where
  the L1 protocol points. `specs/README.md` documents the two-tier arrangement and its
  cross-references check out. No drift; no action taken.
- RTK defect confirmed: `which rtk` fails in Cowork, `./tools/rtk --version` → `rtk 0.42.4`.
- The rules that were violated already existed in two places (`_meta/vault-protocol.md:14` and
  `CLAUDE.md` §1 step 4) → compliance failure, not a specification gap.
- `npm run vault:build` + `npm run vault:check:strict` — see result recorded at task close.

## Follow-up: vault-root drift (same session)

The operator's structural complaint was about the **vault** root as Obsidian shows it, not the repo
root. Re-checked on that reading, and half of it was correct:

- **Not drift:** `Roadmap & Status.md`, `00-INDEX.md`, `Welcome.md`. The first two are pinned by
  `vault.config.json` (`roadmapNote`, `indexNote`) and `rules.mjs:206` reports any competing
  `type: roadmap` note. They belong at vault root.
- **Real drift:** `SPEC-005/006/008/009.md` sat at vault root while `specs/` held only `README.md`.
  Types were incoherent (three `spec`, one off-taxonomy `spec-backlog` that is not in
  `_meta/note-template.md`'s enum), and by content 005/006/009 are pointers to formal Spec Kit
  packages while **008 is the only true backlog note**. `specs/README.md` listed all four as
  "backlog" but tabulated only two, and 005/006 were double-represented in the formal table.
  SPEC-005/006 even carried `../../specs/…` paths — correct only from inside `specs/`, evidence
  they were authored for a folder they never got moved to.
- **Cause:** promotion without cleanup (`context/log/2026-07-28-session-01.md:23` created them at
  root pre-promotion). **Why it survived:** `rules.mjs` owned context placement and the roadmap pin
  and nothing else, and wikilinks resolve by basename — so a misplaced note dangles no links.

Fixed: `git mv` all four into `specs/`, normalized to the canonical `type: spec` with the
pointer/backlog distinction moved to `status:`, corrected relative paths, rewrote the README
section, and added a `spec-misplaced` rule + `specsDir` config key so this cannot recur silently.

## Next handoff

- **Next action:** none blocking. `/status` is available for the next planning question.
- **Evidence needed:** effectiveness is unmeasured. The honest test is an A/B — ask a planning
  question several times with and without `/status` and compare token counts. Measured behavior
  should override ADR-0021's reasoning if they disagree.

## Related

- [[00-INDEX]] · [[0021-retrieval-discipline-by-default|ADR-0021]] · [[environment-setup]] ·
  [[vault-protocol]] · [[Roadmap & Status]]
