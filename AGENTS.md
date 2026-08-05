# Agent Operating Guide

`CLAUDE.md` is the authoritative operating policy for this repository. Read it
before changing code, specifications, or the knowledge vault.

For every task:

1. Read `knowledge-offers-analyzer/context/goals.md`, `context/CURRENT.md`, and the latest
   session log; use `npm run vault:brief -- "Roadmap & Status"` for compact L1 orientation.
2. Start navigation at `knowledge-offers-analyzer/00-INDEX.md`; use `vault:find` and
   `vault:show` to reach the smallest owning note before opening broad source.
3. Keep the vault synchronized with durable code, domain, decision, convention, and operational
   changes. Record the task in today's context log.
4. For non-trivial features, follow the Spec Kit workflow described in
   `CLAUDE.md`.
5. When source or curated-vault changes affect generated facts, run `npm run vault:build`, then
   `npm run vault:check:strict`; `vault:check` remains the compatibility command.
6. Delegate independent, already-specified work to the named subagents in `.claude/agents/`
   rather than doing it in the main context — see `CLAUDE.md` §4 and
   `knowledge-offers-analyzer/conventions/delegation.md`. Read-only agents may run in parallel;
   write-capable agents run one at a time. Spec authorship, ADRs, prioritization, evidence-gated
   scoring changes, and the vault write protocol are never delegated. In a runtime without a
   subagent mechanism, work in-context and state the fallback.

This file deliberately stays short so the policy has one owner. Do not copy or
diverge from `CLAUDE.md`; update that file when the operating policy changes.
