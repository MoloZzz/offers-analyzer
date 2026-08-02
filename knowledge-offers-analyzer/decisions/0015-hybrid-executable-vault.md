---
title: ADR-0015 — Hybrid executable vault and phased enforcement
type: decision
status: Accepted
updated: 2026-08-02
---

# ADR-0015 — Hybrid executable vault and phased enforcement

**Status:** Accepted
**Date:** 2026-08-02

## Context

Offers Analyzer already has valuable governance: a curated, hand-linked vault, MOC navigation,
ADRs, Spec Kit, and a decoupled context inbox (ADR-0001 and ADR-0003). Its lightweight check
currently verifies frontmatter and malformed links, but it cannot provide bounded retrieval,
generated source awareness, a single status owner, or reliable detection of stale derived context.

The imported `ai-infra` folder demonstrates a stronger *mechanism*: generated L1 context,
progressive `find → show → full read` retrieval, a code map, retrieval regression, a strict
build/check write boundary, configurable source adapters, and staged governance checks. It is not
an installable Offers Analyzer solution: its configuration points to a finance product,
`transaction-analytics/`, and `backend/`; its Nest adapter extracts that product's conventions;
and its Claude hooks do not automatically run in Codex Desktop.

Copying either approach wholesale would lose important properties. A new disconnected knowledge
base would violate the single curated source of truth, while leaving the current vault entirely
manual allows context, status, and code documentation to drift as the project grows.

## Decision

Adopt a **hybrid executable vault** for Offers Analyzer.

1. Keep `knowledge-offers-analyzer/` as the single curated, hand-linked source of truth. MOCs,
   ADRs, the existing Spec Kit index, and ADR-0003's `context/` inbox remain. This is deterministic
   curated retrieval, **not** a vector-RAG replacement.
2. Establish concise canonical owners: product card/vision, requirements, architecture
   invariants, one `Roadmap & Status`, ADRs/specs, and decoupled context/handoffs. Durable facts
   are promoted from context; context is excluded from curated graph/retrieval truth.
3. Port the donor's generic engine into `tools/vault/` with a repository-root
   `vault.config.json` that names Offers Analyzer paths. It must never inherit finance product
   data, paths, scripts, or a hard-coded universal context budget.
4. Provide generated L1 context, `find`, bounded `show`, `brief`, a code map, bilingual
   synonym support, and a committed retrieval regression baseline. MOC navigation remains the
   semantic map; progressive retrieval limits how much of that map is loaded at once.
5. Enforce a hard write boundary: `build` is the only command that regenerates `_gen/` and
   declared auto-blocks; `check` always writes nothing. Keep the existing `npm run vault:check`
   alongside the new check until its frontmatter/malformed-link guarantees are covered by a clean
   migration baseline.
6. Start source extraction with an explicit `none` adapter. Add an Offers-specific
   NestJS/TypeORM adapter only for facts it verifies from the real data source, migrations,
   configuration/environment usage, source, tests, and scripts. A selected adapter failure is a
   clear failure, never a guessed code fact.
7. Phase enforcement: report findings first, correct documented baseline debt, then make only
   proven high-signal rules blocking in staged validation/CI. Start `code:`/`rev:` pinning with
   narrowly owned notes rather than forcing all historical notes into a synthetic completeness
   claim.
8. Treat Claude hooks as optional runtime integration after smoke testing. Codex and other
   runtimes use explicit `vault brief` plus concise handoff/reference discipline. Context budgets
   are measured and configured per runtime, not copied from the donor.
9. If an evidence loop is added, it is explicit, read-only, locally cached outside Git, advisory,
   and incapable of auto-enabling scoring factors, rechecks, budget changes, profiles, or other
   production behavior.

## Consequences

**Positive:** agents can orient and retrieve precise context with less token waste; status and
canonical facts have clear owners; generated artifacts and source-derived facts become auditable;
and validation can safely run in hooks/CI because it never writes.

**Costs and constraints:** the team must maintain generated artifacts, retrieval baselines,
synonyms, adapter parsers, and promoted notes. Migration requires a warning period and cleanup;
strict rules before that point would create noisy false positives. Some capabilities differ by
agent runtime, so documented manual commands remain mandatory even if hooks are available.

**Supersession:** this ADR extends ADR-0001's curated-vault choice and ADR-0003's context-zone
decision; it does not supersede either. It replaces no product, API, budget, or scoring decision.

## Related

- [[0001-adopt-sdd-vault-rtk|ADR-0001]]
- [[0003-decoupled-context-zone|ADR-0003]]
- [[decisions/README]]
- [[vault-protocol]]
- [SPEC-012](../../specs/012-executable-vault/spec.md)
