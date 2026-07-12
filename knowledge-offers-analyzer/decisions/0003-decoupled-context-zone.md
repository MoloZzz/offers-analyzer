---
title: ADR-0003 — Decoupled context zone instead of a second knowledge base
type: decision
status: Accepted
updated: 2026-07-12
---

# ADR-0003 — Decoupled context zone instead of a second knowledge base

**Status:** Accepted
**Date:** 2026-07-12

## Context

The vault so far serves agent navigation (curated second brain). But valuable context — goals, session discussions, draft reports — was living only in chat, so it wasn't available to other agents and risked being lost. Two options were considered: (a) a separate second knowledge base for goals/context, or (b) a separate, decoupled area inside the existing vault. A second knowledge base means two places to look and two sets of rules.

## Decision

Add a **decoupled context zone** at `knowledge-offers-analyzer/context/` inside the single knowledge base:

- Holds `goals.md`, session logs (`log/YYYY-MM-DD-*.md`), and drafts.
- **Not woven into the navigation graph** — curated notes don't link out to it, so the `[[link]]` graph stays high-signal. Discovered via a path pointer in [[00-INDEX]] and the read protocol, not via graph links.
- Curated notes remain the **single source of truth**. Context is an **inbox**: durable facts are **promoted** into ADRs / [[glossary]] / [[overview]] / [[coding-standards]] / `research/`.
- The existing read/write navigation protocol ([[vault-protocol]]) is **extended, not changed**.

## Consequences

**Positive:** chat context is persisted in the BZ and available to all agents; goals have a home; the curated navigation vault and its mechanisms are untouched and stay clean.

**Negative / to maintain:** requires the discipline of **promoting** matured notes (or the inbox grows stale); two layers to keep straight (mitigated by clear rules in `context/README.md`).

## Related

- [[decisions/README]] · [[vault-protocol]] · [[00-INDEX]]
