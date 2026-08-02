# Tasks: Executable Hybrid Knowledge Vault

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Status: `[ ]` todo · `[~]` in progress · `[x]` done.

## Phase 1 — SDD and migration baseline

- [x] T001 Record the approved migration intent in `specs/012-executable-vault/` and
  `knowledge-offers-analyzer/decisions/0015-hybrid-executable-vault.md`.
- [x] T002 Capture the existing `scripts/check-vault.js` behavior, current vault warnings, and
  donor `ai-infra/tools/vault/` assumptions in a reproducible migration baseline.
- [x] T003 Add repository-root `vault.config.json` for `knowledge-offers-analyzer/` and `src/`
  without any `transaction-analytics` or `backend/` donor paths.

## Phase 2 — US1: Bounded retrieval and generated orientation (P1)

**Goal**: An agent can receive a small current brief, find a canonical note, show one section,
and consult a source map without loading the entire vault.

**Independent Test**: Build the generated tree, execute all retrieval-baseline queries, and
confirm that each expected note/code target is returned at the agreed rank.

- [x] T004 Port the reusable engine from `ai-infra/tools/vault/` into `tools/vault/`, preserving
  the strict `build`-writes / `check`-never-writes contract.
- [x] T005 Configure the initial `none` adapter in `tools/vault/adapters/none.mjs` and generate
  `knowledge-offers-analyzer/_gen/context.txt`, `index.json`, `graph.json`, `map.tsv`, and
  `health.txt` from Offers Analyzer notes only.
- [x] T006 Implement/verify `find`, `show`, `brief`, and `map` in `tools/vault/v.mjs` against the
  Offers vault; ensure section references survive Ukrainian paths, spaces, and punctuation.
- [x] T007 Add `tools/vault/synonyms.tsv` and `knowledge-offers-analyzer/_retrieval.tsv` with
  representative English/Ukrainian queries for operator profit, API-only sourcing, scoring gate,
  budget, migrations, `ListingSource`, and Telegram.
- [x] T008 Add deterministic retrieval and build-idempotence smoke coverage for the commands and
  committed generated artifacts.

## Phase 3 — US2: Canonical hierarchy and healthy context boundary (P1)

**Goal**: Durable product truth and live status have single owners while context remains a
readable, decoupled inbox/history.

**Independent Test**: Inspect the curated hierarchy, graph input set, and warning report to prove
that the roadmap is the status owner and `context/` is excluded from curated retrieval/graph facts.

- [x] T009 Create and populate `knowledge-offers-analyzer/business/vision-and-goals.md`,
  `business/requirements.md`, `architecture/invariants.md`, and `Roadmap & Status.md` by promoting
  durable facts from the current vault without deleting historical context.
- [x] T010 Reduce `knowledge-offers-analyzer/context/goals.md` to orientation/handoff material and
  split `context/backlog.md` into links to the canonical roadmap, active specs/plans, and retained
  historical/archive context as appropriate.
- [x] T011 Update curated MOCs, relevant durable notes, and navigation protocol so each new
  canonical owner is linked once and ADR-0003's decoupled-context rule remains explicit.
- [x] T012 Add observation-only checks for status leakage, canonical fact duplication, misplaced
  context logs, and missing/stale generated artifacts; give every finding a remediation message.

## Phase 4 — US3: Safe validation and phased enforcement (P2)

**Goal**: Maintainers can regenerate deliberately and validate safely in local workflows, hooks,
and CI without a check changing files.

**Independent Test**: Run `build` twice, run `check` against clean and stale fixtures, and
compare file hashes before/after every check invocation.

- [x] T013 Add project scripts that expose explicit build, check, find, show, brief, and map
  commands while retaining `npm run vault:check` during the compatibility period.
- [x] T014 Implement test coverage for stale `_gen`, frontmatter, malformed links, generated-output
  ownership (no auto-blocks are declared), and the write-free check contract; prove legacy
  frontmatter/link errors remain errors.
- [x] T015 Record a clean warning baseline and document which high-signal rules become blocking,
  their staged/CI scope, owner, and explicit justified bypass.
- [x] T016 Add staged validation/hook integration only after T015; keep it non-destructive and
  retain a direct CI command that works without local hook installation.

## Phase 5 — US4: Offers code facts and narrow traceability (P3)

**Goal**: Generated code facts are trustworthy and selected architecture notes can signal review
when their owned source area changes.

**Independent Test**: Compare generated facts with actual source files, force a parser failure,
and modify a deliberately pinned source path to verify the selected rule's behavior.

- [x] T017 Implement `tools/vault/adapters/offers-nest-typeorm.mjs` against
  `src/common/database/data-source.ts`, `src/common/database/migrations/`, application
  configuration/environment usage, `src/`, `test/`, and `package.json`.
- [x] T018 Switch `vault.config.json` from `none` to the Offers adapter only after its fixture/smoke
  results match the actual entity, migration, environment, script, export, and test inputs.
- [x] T019 Generate and review `knowledge-offers-analyzer/_gen/code-map.txt`; add `code:`/`rev:`
  relationships to a small set of clearly owned architecture notes and test stale-pin detection.
- [x] T020 Keep the initial revision-pin finding non-blocking until its selected owner has been
  reviewed and the migration baseline records zero false positives.

## Phase 6 — Runtime protocol, evidence, and completion

- [x] T021 Document and smoke-test the Codex-compatible `vault brief` plus concise handoff/ref
  protocol; do not claim automatic Claude hook enforcement in unsupported runtimes.
- [x] T022 Keep Claude Code hook integration explicitly optional: the Codex-compatible manual
  brief/handoff protocol is the supported baseline, so no unsupported automatic hook is asserted.
- [x] T023 Add the optional read-only evidence command and ignored local cache only after the core
  retrieval/check flow is stable; test database-unavailable/no-evidence behavior and prove it
  cannot mutate scoring, budgets, profiles, or production parameters.
- [x] T024 Run executable-vault smoke tests, retrieval regression, old and new vault checks,
  typecheck, lint, and relevant Jest tests; update the roadmap/status and task log with outcomes.
