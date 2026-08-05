---
title: Vault Protocol - how agents use and maintain the knowledge base
type: meta
updated: 2026-08-05
---

# Vault Protocol

This vault is a second brain, not passive documentation. It provides a deterministic navigation
and memory layer for the project. Repository policy in ../CLAUDE.md is binding.

## Information hierarchy

Use the smallest authoritative layer that answers the question:

| Level | Purpose | Typical source |
|---|---|---|
| L1 - orientation | Current mission and handoff | context/goals.md, context/CURRENT.md |
| L2 - map | Locate the owning domain and current delivery stream | [[00-INDEX]], [[Roadmap & Status]] |
| L3 - source of truth | Read the actual rule, decision, or plan | vision, requirements, ADR, architecture note, feature spec |
| L4 - implementation evidence | Confirm exact behavior | focused source, test, migration, configuration, or external evidence |

Generated briefs or maps may accelerate L1/L2 when available, but they are navigation aids, not
authority. If a brief is missing or stale, use the primary notes directly. Do not assume an agent
runtime automatically loads any context or runs hooks.

## Executable retrieval and safety

`tools/vault/` is the project-neutral mechanism bound to this vault by `vault.config.json`.
It never imports donor product knowledge. Use it progressively:

```bash
npm run vault:brief -- "Roadmap & Status"     # L1: generated orientation + one requested source
npm run vault:find -- "monthly pool"          # L2: ranked curated references
npm run vault:show -- "Roadmap & Status#current" # L3: one bounded section
```

L4 is a full Markdown or source read only when editing or verifying implementation evidence.
`context/` remains excluded from generated graph, index, map, and ranked retrieval; the brief
names `context/CURRENT.md` as a separately read handoff.

`npm run vault:build` is the only normal writer and updates committed `_gen/` artifacts. Both
`vault:check` and `vault:check:strict` are read-only; the latter turns all findings into failures
and is used by CI. The exceptional `vault:evidence` command is manual, read-only against the
database, advisory, and may write only its ignored local cache.

## Read protocol

Before touching code:

1. Skim context/goals.md, context/CURRENT.md, and the latest dated context/log/ file.
2. Open [[00-INDEX]] and choose the relevant product or technical map.
3. Read the smallest source of truth that owns the fact: [[vision-and-goals]], [[requirements]],
   [[Roadmap & Status]], an ADR, an architecture note, or a feature spec.
4. Open code only after the notes direct you to the relevant implementation. Use focused search to
   verify an implementation detail, not broad scanning as a substitute for navigation.

## Write protocol

Updating the vault is part of done. Capture the durable change at its owner:

- Product intent, users, scope, or non-goals -> [[vision-and-goals]].
- Product obligation or acceptance guardrail -> [[requirements]].
- Current priority, phase, blocker, or evidence exit -> [[Roadmap & Status]].
- Module, boundary, or implementation invariant -> [[overview]] and, when enduring,
  [[invariants]].
- Domain term or rule -> [[glossary]].
- Non-trivial decision -> [[decisions/README|an ADR]].
- New convention or pattern -> [[coding-standards]].
- New tool, environment, or runbook step -> [[environment-setup]].
- New feature spec -> [[specs/README]].

When an input to generated knowledge changes (curated note, source fact, adapter, or vault
configuration), run `npm run vault:build`, then `npm run vault:check:strict`. The compatibility
`vault:check` command also retains the legacy frontmatter/link checker during this migration.

For every task, also record a concise dated note in context/log/. Update context/CURRENT.md only
with the actual active handoff; it must never become a competing roadmap.

**The write protocol is never delegated.** Subagents report durable facts in a `VAULT:` line and
the orchestrator promotes each one to the owner above; a delegated vault edit produces a plausible
note that quietly diverges from what was built. Record the delegation (agent, model, slice) in the
context/log/ entry. See [[delegation]] and
[[0022-delegate-independent-work-to-tiered-subagents|ADR-0022]].

## Context zone

The vault has two distinct layers:

- **Curated vault** (everything except context/) is the source of truth. It is hand-linked from
  [[00-INDEX]] and contains the product hierarchy, MOCs, ADRs, architecture, conventions,
  operations, research, and spec index.
- **Context zone** (context/) is an append-mostly inbox for orientation, current handoff, session
  logs, drafts, and retained history. Curated notes do not link out to it, keeping the graph
  high-signal.

Promote, do not accumulate: once a context item becomes a durable fact, move its substance into
the appropriate curated owner and leave the log as historical evidence. During the migration,
context/backlog.md remains preserved history and staging; it is not the canonical project status.

## Decision supersession sweep

Whenever a decision changes, search the vault for the old fact and update every duplicate in the
same task. Common drift locations are vision/requirements, architecture overview, glossary,
business explanation, roadmap, and context orientation. A note that contradicts an ADR is a defect,
not harmless stale documentation.

The sweep itself is mechanical retrieval and is the standing job of the `oa-vault-scribe` subagent
(haiku, read-only): hand it the old fact and the new fact, and it returns the file:line hits that
still contradict. It reports; the orchestrator edits ([[delegation]]).

## Enforcement baseline and ownership

The 2026-08-02 migration baseline is clean under `npm run vault:check:strict`. Rule ownership is
deliberately narrow:

| Rule group | Default severity | Owner / remediation |
|---|---|---|
| Frontmatter and malformed links | Error | Note author fixes the note; legacy checker remains in the same command. |
| Entity/migration disagreement and focused tests | Error | Source owner fixes the schema registry/migration or removes focused test syntax. |
| Generated freshness, retrieval, graph, environment, context placement, spec placement, fact registry, and revision pins | Warning | Run `vault build`, correct the owner/registry/note, then use strict validation before merge. |

**Note placement is checked, not trusted.** Two directories own a note type: `contextDir` holds
`context`/`context-log` notes and nothing else, and `specsDir` holds every `type: spec` note. A
spec note elsewhere is a `spec-misplaced` finding. This rule was added 2026-08-04 after four spec
notes sat at the vault root undetected — links resolve by **basename**, so a misplaced note
dangles nothing and no other rule owned placement
([[0021-retrieval-discipline-by-default|ADR-0021]]).

CI and the optional hook run strict validation, so the clean baseline must remain clean. There is no
silent environment-variable bypass and `--no-verify` is not an acceptable resolution. A temporary
exception requires a reviewed change to the relevant rule/registry or an ADR-level decision; then
the baseline and documentation must be updated in the same task.

## Note conventions

- One concept per note; link liberally with Obsidian wikilinks.
- Every note has title, type, and updated frontmatter. Bump updated when editing.
- Start a new curated note from [[note-template]] and select the type that owns its fact.
- Use TODO only for a known gap; never invent facts to fill one.
- Keep prose tight. Link to the authoritative note instead of cloning it.
- Run `npm run vault:build` and `npm run vault:check:strict` after a change that affects
  generated vault input. Use `npm run vault:evidence -- --dry` only to validate the advisory
  metric registry; never run evidence as an implicit task-start or commit action.

## Note types

moc, meta, business, roadmap, architecture, domain, decision, convention, operations, spec,
context, and context-log.
