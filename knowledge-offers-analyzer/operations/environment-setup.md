---
title: Environment setup & tooling
type: operations
updated: 2026-08-02
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
- If the runtime cannot execute the Linux/musl RTK binary, run the native command and record that
  fallback in the session log. Quality gates must still run.
- Custom filters: `.rtk/filters.toml`.

## Spec Kit (SDD)

- Installed under `.specify/` (constitution, templates, scripts, workflows) with `/speckit-*` skills in `.claude/skills/`.
- Workflow: `/speckit-constitution` (once) → `/speckit-specify` → `/speckit-clarify` (optional) → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` (optional) → `/speckit-implement`.
- Scripts are `sh` (bash) — consistent with the Linux/WSL environment RTK requires.
- To upgrade Spec Kit later: `uvx --from git+https://github.com/github/spec-kit.git specify init --here --force --integration claude --script sh` (needs Python ≥3.11).

## Executable vault

The curated vault remains authoritative. `tools/vault/` adds deterministic orientation and focused
retrieval; it does not replace MOCs, ADRs, or the context boundary. Start a task with the
generated brief plus `context/CURRENT.md`, then use find/show before opening broad source.

```bash
npm run vault:build
npm run vault:brief -- "Roadmap & Status"
npm run vault:find -- "ListingSource"
npm run vault:show -- "Roadmap & Status#current"
npm run vault:check:strict
```

- `vault:build` is the only normal writer and updates only `knowledge-offers-analyzer/_gen/`.
  It is deliberate: check, find, show, brief, and map never regenerate files.
- `vault:check` runs the executable and retained legacy checker. `vault:check:strict` makes any
  warning (including stale generated output) fail, and is the CI gate.
- `vault:test` tests the portable engine and advisory evidence contract without a database.
- `vault:evidence -- --dry` validates `knowledge-offers-analyzer/_metrics.tsv` with no connection
  or writes. A real evidence run uses `DATABASE_URL` in a PostgreSQL `READ ONLY` transaction and
  writes only ignored `tools/vault/.evidence.tsv`; its output never changes application behavior.
- Native Windows PowerShell may require `npm.cmd` rather than `npm`. This is a command-wrapper
  difference, not permission to skip the gate; record the fallback in the session log.

An optional non-mutating pre-commit hook is stored in `.githooks/pre-commit`. Enable it only per
checkout after the dependencies are installed:

```bash
chmod +x .githooks/pre-commit  # Linux/macOS only
git config core.hooksPath .githooks
```

The hook runs the same strict check as CI and never builds artifacts or accesses the database.

## Portable AI infrastructure kit

`ai-infra/` is a versioned, copy-and-own bootstrap kit for other repositories. It packages the
generic second-brain, product-vision loop, context-control protocol, retrieval engine, and
collision-safe initializer. It is not an application runtime dependency and does not replace this
project's configured `tools/vault/` or Offers-specific source adapter.

Validate the kit while developing it here:

```bash
npm run ai-infra:test
```

To inspect a fresh target without writing, run `node ai-infra/bin/ai-infra.mjs init --target
<path> --project-name "Name" --dry-run`; use `--apply` only after reviewing the file plan. A
target starts with `adapter: "none"`, direct Node commands, and no enabled hooks, CI, source
adapter, network call, or evidence query. Copy optional integrations only after that target has a
clean generated-artifact baseline. See [[0016-portable-ai-infra-kit|ADR-0016]] and
`../ai-infra/README.md`.

## Project

- App: NestJS. Standard scripts (`npm run build`, `test`, `lint`) — run them through RTK.
- Repo: `MoloZzz/offers-analyzer`.
- **Run under a process supervisor.** Since [[0008-global-error-handling|ADR-0008]], `main.ts`
  exits the process (`process.exit(1)`) on an uncaught exception or unhandled rejection rather
  than trying to continue in a possibly-corrupted state. In production this requires something
  that restarts the process automatically — e.g. `systemd` (`Restart=always`), `pm2`, or a
  Docker `restart: unless-stopped` policy — otherwise a fatal error means the bot stays down
  until someone restarts it manually.

## Related

## Telegram monitoring administration

Set `TELEGRAM_ADMIN_CHAT_IDS` to a comma-separated list of Telegram chat IDs before deployment.
After SPEC-014 is deployed, an authorized admin can use `/daily_limit off`, `/daily_limit on`, and
`/daily_limit status` to control the persisted `auto-ria` daily request-limit state without
restarting the app. The monthly pool remains enforced; `/stop` and `/mute` only affect
notifications.

- [[00-INDEX]]
- [[coding-standards]]
- [[0001-adopt-sdd-vault-rtk]]
