---
title: Environment setup & tooling
type: operations
updated: 2026-07-25
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
- **Run under a process supervisor.** Since [[0008-global-error-handling|ADR-0008]], `main.ts`
  exits the process (`process.exit(1)`) on an uncaught exception or unhandled rejection rather
  than trying to continue in a possibly-corrupted state. In production this requires something
  that restarts the process automatically. This is now discharged by the container's
  `restart: unless-stopped` policy — see Deployment below and
  [[0011-containerized-deploy-migrate-on-start|ADR-0011]]. Running the app outside a container
  still needs `systemd` (`Restart=always`) or `pm2`.

## Deployment (Docker)

Artifacts: `Dockerfile` (multi-stage), `docker-entrypoint.sh`, `.dockerignore`,
`docker-compose.yml` (`app` + `postgres`). Rationale and trade-offs:
[[0011-containerized-deploy-migrate-on-start|ADR-0011]].

**Deploy = pull image + restart.** The entrypoint applies pending migrations
before the app process starts, so there is no manual migration step and the app
cannot boot against an unmigrated schema (a failing migration fails container
start).

```bash
# Full local/prod stack
docker compose up -d --build
docker compose logs -f app

# Or standalone (env injected by the host/orchestrator)
docker build -t offers-analyzer .
docker run -d --name offers-analyzer --restart unless-stopped \
  --env-file .env -p 3000:3000 \
  -v "$PWD/config/search-profiles.json:/app/config/search-profiles.json:ro" \
  offers-analyzer
```

Things to know before you touch it:

- **Migrations run from the compiled datasource** — `dist/common/database/data-source.js`,
  via the `typeorm` CLI (`npm run migration:run:prod`). The `migration:run` script
  uses `typeorm-ts-node-commonjs`, which needs devDependencies and therefore does
  **not** work in the runtime image. Keep both paths working.
- `RUN_MIGRATIONS=false` skips the migration step (for hosts where a separate
  release step owns them). `DATABASE_URL` is required whenever it is `true`.
- **`config/search-profiles.json` is not in the image** (gitignored operator data,
  excluded in `.dockerignore`) — mount it, or set `SEARCH_PROFILES_FILE`. Without
  it the app starts and logs "No profiles config found — nothing to monitor".
  `config/heuristics/*.json` *is* baked in.
- In compose, `DATABASE_URL` is overridden to the `postgres` service host; the
  `.env` value (localhost) is for running the app outside Docker.
- **The healthcheck is a TCP connect,** because the app has no `@Controller` and
  every HTTP route 404s. It proves the process is listening, nothing more — the
  in-app dead-man's-switch is still the real liveness signal.
- `tini` is PID 1 so `docker stop` actually terminates Node instead of waiting
  for SIGKILL.
- Single instance only: migrate-on-start races if two containers boot together.

## Related

- [[00-INDEX]]
- [[coding-standards]]
- [[0001-adopt-sdd-vault-rtk]]
- [[0011-containerized-deploy-migrate-on-start]]
