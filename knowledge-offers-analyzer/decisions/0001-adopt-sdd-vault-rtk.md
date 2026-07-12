---
title: ADR-0001 — Adopt Spec-Driven Development, a knowledge vault, and RTK
type: decision
status: Accepted
updated: 2026-07-12
---

# ADR-0001 — Adopt Spec-Driven Development, a knowledge vault, and RTK

**Status:** Accepted
**Date:** 2026-07-12

## Context

Offers Analyzer is developed primarily by AI coding agents. Three recurring problems needed addressing before feature work:

1. Agents navigate projects by ad-hoc grepping, which is slow, token-heavy, and loses institutional knowledge between sessions.
2. Jumping straight to code produces drift between intent and implementation.
3. Verbose command output (tests, tsc, git, lint) burns large amounts of context for little signal.

## Decision

Adopt three practices, wired together and enforced through `../CLAUDE.md`:

1. **Knowledge vault (second brain).** An Obsidian vault at `knowledge-offers-analyzer/` is the primary navigation layer. Agents read [[00-INDEX]] first and keep notes current as part of every task. A curated, hand-linked vault is chosen over vector RAG, which is inefficient and noisy at this project's scale.
2. **Spec-Driven Development via GitHub Spec Kit.** Installed under `.specify/` with `/speckit-*` skills. Non-trivial features follow `constitution → specify → plan → tasks → implement`.
3. **RTK (Rust Token Killer).** Binary at `tools/rtk`; a Claude Code `PreToolUse` hook (`.claude/settings.json`) auto-rewrites Bash commands to `rtk …` to compact noisy output. Rules in `.claude/RTK.md`.

## Consequences

**Positive:** deterministic navigation, persistent project memory, intent captured before code, meaningful token savings on noisy commands.

**Negative / to maintain:** the vault must be updated every task or it rots; RTK enforcement via hooks only applies when running Claude Code as a CLI (Cowork does not execute hooks) and the binary is `x86_64` Linux/musl, so it requires a Linux/WSL environment with `rtk` on `PATH`; SDD adds up-front ceremony for small changes.

## Related

- [[decisions/README]]
- [[environment-setup]]
- [[vault-protocol]]
