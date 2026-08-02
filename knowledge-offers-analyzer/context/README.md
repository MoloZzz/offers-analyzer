---
title: Context zone - decoupled inbox for handoff, logs, and drafts
type: context
updated: 2026-08-02
---

# Context zone

This folder is deliberately decoupled from the curated navigation graph. It preserves working
context without turning chat history into a competing product specification.

## The two layers

- **Curated vault** - product vision, requirements, roadmap, architecture, domain, ADRs,
  conventions, operations, research, and the feature-spec index. It is the source of truth and is
  navigated from [[00-INDEX]].
- **Context zone** - short orientation, current handoff, dated session logs, drafts, and retained
  historical planning material. Curated notes do not link out here, so the graph remains
  high-signal.

## What belongs here

- goals.md - short session orientation that points to canonical product notes.
- CURRENT.md - small, overwriteable handoff: active work, next pickup, and immediate blockers.
- log/YYYY-MM-DD-short-topic.md - one historical session record; copy log/_TEMPLATE.md to start.
- backlog.md - retained historical execution queue and staging area during migration. It is not the
  canonical status or feature contract.
- Drafts and temporary investigation material that have not yet become durable facts.

## Agent read and write flow

At the start of a task, read goals.md, CURRENT.md, and the latest dated log. Then enter the
curated vault through [[00-INDEX]] and use the product hierarchy or MOCs.

During work, record concrete changes and open questions in a dated log. Before finishing, promote
durable material to its curated owner:

| Durable material | Curated owner |
|---|---|
| Product intent, scope, or non-goal | [[vision-and-goals]] |
| Product requirement or release gate | [[requirements]] |
| Priority, status, blocker, or exit evidence | [[Roadmap & Status]] |
| System boundary or invariant | [[overview]] and [[invariants]] |
| Decision | [[decisions/README]] |
| Domain term | [[glossary]] |
| Feature design | repo-root spec, indexed from [[specs/README]] |

## The rule: promote, do not accumulate

Context is the entry point and historical record, not the destination. Once a note becomes a
durable fact, copy its substance to the appropriate curated owner and leave the context note as
history. Do not maintain a second vision, requirements list, or roadmap here.

For the rationale behind the decoupled zone, see [[0003-decoupled-context-zone|ADR-0003]].
