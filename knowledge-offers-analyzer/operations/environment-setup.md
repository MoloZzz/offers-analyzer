---
title: Environment setup & tooling
type: operations
updated: 2026-07-12
---

# Environment setup & tooling

> Runbook for the agent/dev environment. See [[0001-adopt-sdd-vault-rtk|ADR-0001]] for the rationale.

## RTK (token-saving command wrapper)

- Binary: `tools/rtk` (v0.42.4, `x86_64-unknown-linux-musl`). Source archive kept alongside it: `tools/rtk-x86_64-unknown-linux-musl.tar.gz`.
- Enforcement: `.claude/settings.json` registers a `PreToolUse` hook (`rtk hook claude`) that auto-rewrites Bash commands to their `rtk` equivalent. Usage rules: `../.claude/RTK.md`.
- **Requirements for the hook to work:**
  - Linux or WSL (the binary is Linux/musl — it will not run on native Windows).
  - `rtk` on `PATH`. The hook and the rewritten commands both call bare `rtk`. Put it on PATH, e.g.:
    ```bash
    # from repo root, in Linux/WSL
    ln -sf "$PWD/tools/rtk" ~/.local/bin/rtk   # or: sudo cp tools/rtk /usr/local/bin/rtk
    rtk --version   # expect: rtk 0.42.4
    ```
  - If `tools/rtk` is missing after a fresh checkout, restore it: `tar -xzf tools/rtk-x86_64-unknown-linux-musl.tar.gz -C tools && chmod +x tools/rtk`.
- Note: hooks run only under the **Claude Code CLI**. Cowork does not execute PreToolUse hooks, so there RTK is a discipline (use `rtk …` yourself) rather than automatic.
- Custom filters: `.rtk/filters.toml`.

## Spec Kit (SDD)

- Installed under `.specify/` (constitution, templates, scripts, workflows) with `/speckit-*` skills in `.claude/skills/`.
- Workflow: `/speckit-constitution` (once) → `/speckit-specify` → `/speckit-clarify` (optional) → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` (optional) → `/speckit-implement`.
- Scripts are `sh` (bash) — consistent with the Linux/WSL environment RTK requires.
- To upgrade Spec Kit later: `uvx --from git+https://github.com/github/spec-kit.git specify init --here --force --integration claude --script sh` (needs Python ≥3.11).

## Project

- App: NestJS. Standard scripts (`npm run build`, `test`, `lint`) — run them through RTK.
- Repo: `MoloZzz/offers-analyzer`.

## Related

- [[00-INDEX]]
- [[coding-standards]]
- [[0001-adopt-sdd-vault-rtk]]
