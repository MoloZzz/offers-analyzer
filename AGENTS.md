# Agent Operating Guide

`CLAUDE.md` is the authoritative operating policy for this repository. Read it
before changing code, specifications, or the knowledge vault.

For every task:

1. Read `knowledge-offers-analyzer/context/goals.md` and the latest session log.
2. Start navigation at `knowledge-offers-analyzer/00-INDEX.md`; use its MOCs and
   linked notes to locate the relevant code and decisions.
3. Keep the vault synchronized with durable code, domain, decision, convention,
   and operational changes. Record the task in today's context log.
4. For non-trivial features, follow the Spec Kit workflow described in
   `CLAUDE.md`.
5. Before completion, run the appropriate quality gates, including
   `npm run vault:check` when the vault changes.

This file deliberately stays short so the policy has one owner. Do not copy or
diverge from `CLAUDE.md`; update that file when the operating policy changes.
