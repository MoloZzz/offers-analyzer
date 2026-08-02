# Implementation Plan: Executable Hybrid Knowledge Vault

**Spec**: [spec.md](spec.md) | **Created**: 2026-08-02 | **Status**: Implemented

## Summary

Turn the existing curated second brain into a hybrid executable vault. Keep Offers Analyzer's
MOCs, ADRs, SDD specs, and decoupled context rule as durable truth; add the donor's portable
Node-based generation, bounded retrieval, source map, and staged integrity checks. The migration
uses an Offers-specific configuration and adapter, begins in warning/observation mode, and keeps
the current `vault:check` in parallel until the new system has a clean baseline.

## Technical Context

- **Language/runtime**: Node.js ESM for the vault tool; Markdown/TSV/JSON generated artifacts.
- **Primary dependencies**: Node built-ins and the copied portable `tools/vault/` engine; no
  vector database or external retrieval service.
- **Source inputs**: `knowledge-offers-analyzer/`, `src/`, `test/`,
  `src/common/database/data-source.ts`, `src/common/database/migrations/`, application
  configuration, and `package.json`.
- **Generated outputs**: `knowledge-offers-analyzer/_gen/` context, map, graph, health/index,
  code-map, and verified source-facts artifacts; generated blocks only where an explicitly owned
  note declares them.
- **Validation**: Existing `npm run vault:check`, executable-vault smoke tests, retrieval baseline,
  then repository typecheck/lint/test gates appropriate to the changed implementation.
- **Constraints**: `build` is the only writer; `check` is always write-free. The context zone is
  excluded from the curated graph. Claude hooks are optional and must not be required in Codex.
- **Migration safety**: No destructive rewrite of context/history; no strict global revision-pin
  rule until a documented zero-warning baseline exists.

## Constitution Check

- **I Spec-driven**: This spec, plan, checklist, ADR, and concrete tasks precede tool and
  information-architecture changes.
- **II Knowledge base**: The implementation strengthens the curated vault and preserves
  ADR-0003's decoupled context zone rather than adding a competing knowledge base.
- **III Clean/simple code**: Adopt the portable donor engine with a small project configuration
  seam and an Offers-specific adapter; do not build a custom RAG system.
- **IV Ports/adapters**: Source extraction is isolated behind the adapter interface and starts
  with `none` until the Offers adapter is proved against actual code.
- **V External limits**: The core vault operations are local. Evidence is separately invoked,
  read-only, cacheable, and cannot alter API use or production settings.
- **VI Testing**: Verify `build`/`check` contracts, deterministic retrieval, adapter facts, and
  regression of existing vault validation without live source requests.
- **VII Token efficiency**: L1/L2/L3/L4 retrieval and code map reduce unnecessary full-note/code
  reads; a context governor is opt-in per supported runtime, never a hidden dependency.
- **VIII Executable knowledge hygiene**: Generated context stays derivative, checks stay write-free,
  context stays outside curated retrieval, and optional evidence remains explicit and advisory.

No constitution exception is required.

## Project Structure

```text
vault.config.json                              # Offers-specific vault binding
tools/vault/
  v.mjs                                        # executable-vault command surface
  lib/                                          # generic build/check/retrieval engine
  adapters/
    none.mjs                                   # safe no-code-facts bootstrap
    offers-nest-typeorm.mjs                    # verified Offers Analyzer extraction
  synonyms.tsv                                 # English/Ukrainian retrieval bridge
knowledge-offers-analyzer/
  _gen/                                        # committed reproducible derived artifacts
    facts.txt                                   # verified entity/migration/env/script/test facts
  business/
    vision-and-goals.md
    requirements.md
  architecture/
    invariants.md
  Roadmap & Status.md                          # single durable status owner
  context/                                     # decoupled handoff/log/draft zone
  decisions/0015-hybrid-executable-vault.md
  specs/README.md
scripts/check-vault.js                         # retained during compatibility phase
specs/012-executable-vault/
  spec.md
  plan.md
  tasks.md
  checklists/requirements.md
```

## Design and Migration Decisions

1. **Keep the two existing layers.** Curated notes remain hand-linked, human-auditable source of
   truth. `context/` stays outside the curated graph and retrieval corpus, but an explicit current
   handoff/log pointer stays in the L1 orientation pack.
2. **Add a short canonical hierarchy instead of duplicating facts.** Product card/vision,
   requirements, invariants, roadmap/status, ADRs/specs, and context each have one role. Existing
   notes are migrated by promotion and links, not bulk deletion.
3. **Treat the donor as a generic engine, not a template product.** Copy and parameterize
   `ai-infra/tools/vault/`; create repository-root `vault.config.json` pointing to
   `knowledge-offers-analyzer/` and `src/`. Do not reuse `transaction-analytics`, `backend/`, or
   finance facts.
4. **Bootstrap with no source claims.** First run the generic `none` adapter so L1/retrieval and
   graph behavior can be verified independently. Then implement `offers-nest-typeorm.mjs` against
   the actual TypeORM data source, migrations, configuration, source exports, scripts, and tests.
5. **Make retrieval progressive.** Generated L1 context gives orientation; `find` ranks hits;
   `show` returns one section; `brief` combines explicitly named sections. Full Markdown reads
   remain for edits or cases where a bounded section is insufficient.
6. **Separate writing from validation structurally.** `build` regenerates `_gen/` and declared
   auto-blocks; `check` only inspects. The legacy checker remains a compatibility gate until its
   frontmatter/malformed-link protections are demonstrably covered.
7. **Enforce in phases.** Start with generated freshness, status ownership, duplicate/canonical
   fact, revision-pin, retrieval, and context-placement findings as visible warnings. After
   cleanup and a recorded zero baseline, promote only proven high-signal rules to blocking staged
   and CI checks. Each rule needs an owner and documented bypass.
8. **Keep code evidence narrow and truthful.** Add `code:`/`rev:` only to notes that explicitly
   own a source area, pin them after review, and expand coverage gradually. A parser failure is an
   error for the selected adapter, not permission to fabricate a fact.
9. **Keep runtime integrations honest.** Codex uses explicit `vault brief` plus a concise
   handoff/subagent-reference contract. Claude hooks are a separately smoke-tested convenience;
   no fixed donor context budget or hook behavior is imposed on all runtimes.
10. **Keep evidence advisory.** If introduced after retrieval/check health, it runs only on
    explicit request, caches its local observation outside Git, and reports readiness without
    enabling any product behavior.

## Delivery Phases

### Phase 0 — Baseline and compatibility

Record current frontmatter/link-check behavior, current MOC/context navigation, and the donor
tool's assumptions. Add a project-specific config and generic adapter first. This establishes a
safe comparison point before moving notes or adding enforcement.

### Phase 1 — Build, retrieval, and generated map

Port the generic engine, generate `_gen/` only from the Offers vault, implement deterministic
find/show/brief/map commands, add a bilingual synonym table and a representative retrieval
baseline. Verify all generated output is reproducible.

### Phase 2 — Canonical hierarchy and status ownership

Promote durable vision/requirements/invariants and a single roadmap/status owner out of the
oversized context/backlog material. Link rather than duplicate, retain history, and make status
leaks/canonical fact drift observable before blocking.

### Phase 3 — Offers source adapter and integrity rules

Implement source extraction against actual project paths. Generate code map and only then add
narrow code/revision relationships. Cover generated freshness, adapter failure, stale pins, and
retrieval regression with deterministic fixtures/smoke checks.

### Phase 4 — Enforcement and runtime integrations

Run legacy and new checks in parallel; fix warnings to a recorded baseline; activate staged/CI
rules selectively. Document Codex manual retrieval/handoff and add Claude hooks only after
non-invasive smoke testing. Add optional evidence only after this core is stable.

## Verification Strategy

1. Build twice; the second run must leave declared generated output unchanged.
2. Snapshot or fixture-test `check` to prove it writes no files when clean or failing.
3. Execute all entries in `_retrieval.tsv` and report expected/actual references and rank.
4. Compare adapter output with `data-source.ts`, migrations, configuration/environment access,
   package scripts, source exports, and tests. Test parser failure explicitly.
5. Run legacy `npm run vault:check` alongside the new checker through the compatibility phase.
6. Run the repository's typecheck, lint, and relevant Jest suites after executable-tool or
   package-script changes; do not call external AUTO.RIA services.
