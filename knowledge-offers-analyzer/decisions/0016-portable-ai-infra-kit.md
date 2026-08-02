---
title: Portable AI infrastructure kit
type: decision
updated: 2026-08-02
summary: Adopt a versioned, copy-and-own bootstrap kit for reusable AI infrastructure.
---

# ADR-0016 — Package reusable AI infrastructure as a portable bootstrap kit

**Status:** Accepted
**Date:** 2026-08-02

## Context

Offers Analyzer now has a healthy executable vault, canonical product hierarchy, decoupled context
zone, progressive L1-to-L4 retrieval, and strict write/check boundaries. Those mechanisms are
valuable across projects, but its TypeORM adapter, AUTO.RIA product knowledge, PostgreSQL evidence
registry, current configuration, and generated facts are deliberately project-owned.

Copying the repository's vault as a universal template would leak a specific product model into
unrelated work. A shared live dependency would also allow unreviewed policy changes to alter a
project's knowledge workflow. The requested empty `ai-infra/` directory needs a reusable model
that starts safely on documentation-only projects and grows through explicit integrations.

## Decision

Create `ai-infra/` as a versioned, copy-and-own bootstrap kit.

1. The core contains only generic Markdown-vault operations: safe configuration, curated/context
   separation, graph and generated orientation, bounded retrieval, build-only derived writes, and
   read-only checks.
2. The kit provides clean-room templates for vision, requirements, invariants, roadmap, ADR/spec,
   context handoff/logs, and agent protocol. It defines the product-learning loop but never
   supplies a project's product facts or priorities.
3. A `none` adapter is the default. Project source facts use explicit optional capabilities; the
   Offers NestJS/TypeORM adapter stays in this repository.
4. Bootstrap is collision-safe: dry-run is the default, apply is explicit, and integrations such
   as CI, hooks, agent snippets, adapters, and evidence remain opt-in.
5. PostgreSQL evidence is documented as an optional extension only. It cannot run during init,
   build, check, CI, or hooks.
6. Initial distribution is a version-marked copy owned by each target repository. Revisit a
   standalone repository/package only after successful adoption by materially different projects.

## Consequences

Projects gain a consistent second-brain and context-control baseline without inheriting Offers
terminology or database requirements. The kit must maintain its own fixtures, compatibility
contract, template safety, and migration documentation. Consumers own their installed copy and
choose when to upgrade; this intentionally avoids automatic synchronization.

## Related

- [[0015-hybrid-executable-vault|ADR-0015]]
- [[0001-adopt-sdd-vault-rtk|ADR-0001]]
- [[0003-decoupled-context-zone|ADR-0003]]
- [[vault-protocol]]
- [SPEC-013](../../specs/013-portable-ai-infra/spec.md)
