---
title: ADR-0011 — Containerized deploy with migrations applied at container start
type: decision
status: Accepted
updated: 2026-07-25
---

# ADR-0011 — Containerized deploy with migrations applied at container start

**Status:** Accepted
**Date:** 2026-07-25

## Context

Until now the app had no deployment artifact: `docker-compose.yml` started only
Postgres, and the app was run by hand (`npm run start:prod`) with migrations
applied manually via `npm run migration:run`. Two problems followed from that:

1. **[[0008-global-error-handling|ADR-0008]] is unsatisfied without a supervisor.**
   `main.ts` deliberately calls `process.exit(1)` on an uncaught exception or
   unhandled rejection. With no restart policy a single fatal error means the bot
   is silently down until someone notices — which for a monitoring tool defeats
   the point (it is a dead-man's-switch that cannot ring its own alarm).
2. **Manual migrations are a deploy-order footgun.** A deploy that ships new
   entity columns but forgets `migration:run` boots the app against an old
   schema; the failure surfaces later, at query time, inside a cron job.

A constraint worth naming: the migration scripts in `package.json` use
`typeorm-ts-node-commonjs` against `src/common/database/data-source.ts`. That
needs `ts-node` + `typescript`, both **devDependencies** — so the existing
scripts cannot run in a prod-only image without shipping the whole dev tree.

## Decision

Ship a **multi-stage Dockerfile** (`builder` compiles TS with full deps →
`runtime` carries prod deps + `dist/` + `config/`) and apply **pending
migrations in the container entrypoint** (`docker-entrypoint.sh`) before the app
process starts. A deploy is therefore "pull image + restart", with no manual step.

Specifics that follow:

- Migrations run against the **compiled** datasource
  (`node ./node_modules/typeorm/cli.js migration:run -d dist/common/database/data-source.js`),
  not the TS one. `typeorm` and `pg` are runtime dependencies, so the prod-only
  image needs no `ts-node`. The migration glob in `buildDataSourceOptions()` is
  already `*.{ts,js}`, so it picks up `dist/common/database/migrations/*.js`
  unchanged. Convenience scripts: `migration:run:prod` / `migration:revert:prod`.
- A failing migration **fails container start** (`set -e`) rather than letting
  the app boot against a half-migrated schema.
- `RUN_MIGRATIONS=false` opts out, for hosts where a separate release step owns
  migrations.
- `restart: unless-stopped` in compose is what discharges ADR-0008's supervisor
  requirement.
- **tini as PID 1.** Node installs no `SIGTERM` handler, so as PID 1 it would
  ignore `docker stop` until the SIGKILL timeout.
- **Healthcheck is a TCP connect,** not an HTTP probe: the app has no
  `@Controller` at all, so every route 404s. A successful connect proves
  bootstrap finished and `app.listen()` was reached — the honest signal
  available today. Replace with a real `/health` route if one is ever added.
- `config/search-profiles.json` (the operator's real niches, gitignored) is
  excluded via `.dockerignore` and **mounted** at runtime instead, so operator
  data never lands in an image layer. `config/heuristics/*.json` *is* baked in —
  it is committed, code-adjacent tuning data read from `process.cwd()`.

## Consequences

**Easier.** Deploy is one step and schema drift becomes structurally impossible:
the app cannot start against an unmigrated DB. Fatal errors now self-heal via the
restart policy. The image is prod-only (no dev tree, no `ts-node`), and the build
context excludes the vault, specs and `tools/`.

**Harder / to maintain.** Two migration paths now exist (TS for dev, compiled for
prod) and both must keep working — a migration that only compiles under `ts-node`
would pass locally and fail in the container. Migrate-on-start also assumes a
**single** app instance: two containers booting together would race on the
migrations table (TypeORM's transaction limits the damage but this is not a
scale-out design). Rollback is not automatic — a bad migration must be reverted
deliberately (`migration:revert:prod`).

**Still missing** (not addressed here): no CI workflow builds or publishes the
image, and there is no HTTP health endpoint, so the healthcheck can only prove
the socket is open, not that polling is alive. The in-app dead-man's-switch
remains the real liveness signal.

## Related

- [[decisions/README]]
- [[0008-global-error-handling|ADR-0008]] — the reason a supervisor is mandatory
- [[environment-setup]] — the deploy runbook
- [[overview]]
