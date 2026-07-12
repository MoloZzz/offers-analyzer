---
title: Context zone — decoupled inbox for goals, notes & session logs
type: context
updated: 2026-07-12
---

# Context zone (decoupled)

This folder is a **deliberately decoupled** part of the knowledge base. It exists so that the rich context we build in chat (goals, decisions-in-progress, session notes, draft reports) lives in the knowledge base — available to every agent — **without** polluting or breaking the curated navigation vault.

## The two layers (do not mix them)

- **Curated vault** (`architecture/`, `domain/`, `decisions/`, `conventions/`, `operations/`, `research/`, `specs/`) — the **source of truth**. Hand-linked with `[[wikilinks]]`, navigated from [[00-INDEX]], governed by the strict read/write protocol in [[vault-protocol]]. High signal.
- **Context zone** (`context/`) — the **inbox / working memory**. Append-mostly, chronological, low ceremony. It is intentionally **not woven into the navigation graph**: curated notes do not link out to it, so the graph stays clean.

## What goes here

- `goals.md` — living project goals & scope.
- `log/` — one file per working session (`YYYY-MM-DD-*.md`): what was discussed, decided, deferred, and the open questions. This is where "the chat context" is persisted.
- Draft notes and scratch that isn't yet a durable fact.

## The rule that keeps the vault intact: **promote, don't accumulate**

The context zone is the entry point, not the destination. When something here matures into a durable fact or decision, **promote it into the curated vault** and leave the log as-is (historical record):

| When a log entry becomes… | Promote it to… |
|---|---|
| A locked decision | an ADR in [[decisions/README]] |
| A domain term or rule | [[glossary]] |
| A structural/architecture fact | [[overview]] |
| A convention | [[coding-standards]] |
| An investigation with a conclusion | a note in `research/` |

## Agent usage

- **At session start:** read `context/goals.md` and the latest `context/log/*` for background — *then* navigate via [[00-INDEX]] as usual.
- **During work:** jot session notes/decisions into today's `context/log/` file freely.
- **Before finishing:** promote anything durable into the curated vault (per the table above). The context zone never replaces the curated notes.

> Decision rationale: [[0003-decoupled-context-zone|ADR-0003]].
