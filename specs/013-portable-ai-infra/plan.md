# Implementation Plan: Portable AI Infrastructure Kit

**Branch**: `013-portable-ai-infra` | **Date**: 2026-08-02 | **Status**: Implemented | **Spec**: [spec.md](spec.md)

## Summary

Create `ai-infra/` as a clean-room, versioned bootstrap kit. It extracts the generic executable
vault and its L1-to-L4 context discipline, supplies neutral product-governance templates, and
offers a collision-safe Node initializer. Stack-specific source facts and PostgreSQL evidence are
plugins, never a core assumption.

## Technical Context

**Language/Version**: Node.js ESM, Node 20
**Primary Dependencies**: Node built-ins in core; `pg` only in optional Postgres documentation/plugin
**Storage**: Markdown, JSON, TSV, generated local files
**Testing**: `node --test`
**Target Platform**: Windows, macOS, Linux
**Project Type**: versioned bootstrap kit / CLI
**Constraints**: no install-time overwrite; core never accesses a DB; build is the normal writer;
check and dry-run are write-free; no project-specific product content.

## Constitution Check

- **Spec-driven**: this package is specified before extraction and has explicit tasks/tests.
- **Knowledge base**: it reinforces the existing vault without replacing the Offers source of truth.
- **Clean/simple**: Node built-ins and a small CLI are preferred over a framework or central service.
- **Ports/adapters**: code facts use optional capability providers rather than a universal schema.
- **External limits**: evidence stays explicit and read-only as an optional integration.
- **Testing**: core, initializer, and docs-only fixture tests are mandatory.
- **Token efficiency**: generated L1 plus bounded L2/L3 retrieval are preserved without fixed
  runtime budgets.

## Project Structure

```text
ai-infra/
  README.md
  VERSION
  manifest.json
  bin/ai-infra.mjs
  engine/
    v.mjs
    lib/
    adapters/none.mjs
    test/
  templates/
    vault/
    vault.config.json.template
  adapters/
    adapter-contract.md
    project-adapter.template.mjs
  integrations/
    agents/
    github-actions-quality.yml
    hooks/pre-commit
    npm-scripts.md
  plugins/
    README.md
    postgres-evidence/
  docs/
    operating-model.md
    migration.md
    security.md
```

## Design Decisions

1. Preserve the generic Markdown/retrieval machinery but make code facts optional. The core knows
   only generic facts exposed by an adapter capability map; no entity/migration/provider shape is
   mandatory.
2. Ship only the null adapter. The current Offers Nest/TypeORM adapter remains in its project.
3. Treat `templates/` as clean-room content with placeholders; do not copy the current project
   vault, generated artifacts, current logs, or domain terms.
4. Use `init --dry-run` followed by `--apply`; refuse existing target files and never enable hooks
   or CI automatically.
5. Make product governance and context control part of the template/protocol, not a hidden
   prompt/runtime hook. Manual commands are the baseline across Codex, Claude, and other clients.
6. Keep Postgres evidence documented as an optional plugin whose future code must be explicit,
   SELECT-only, and local-cache-only.

## Delivery Phases

### Phase 1 — Kit core

Copy and generalize the executable-vault engine, test it against a clean docs-only fixture, and
separate optional fact capabilities from core rendering/rules.

### Phase 2 — Governance templates

Create neutral index, product hierarchy, context zone, ADR/spec, policy, and protocol templates
that establish the vision-to-evidence learning loop.

### Phase 3 — Bootstrap and integrations

Implement the safe initializer and doctor command; add opt-in CI, hook, agent, adapter, and
evidence documentation.

### Phase 4 — Verification and current-project reflection

Run kit tests and a disposable fixture, scan for accidental Offers leakage, update the project
ADR/spec/index/architecture/context, regenerate the current vault, and run strict quality gates.
