# Security boundaries

The core is designed to make documentation and retrieval safer, not to gain authority over a
project.

## Core guarantees

- Initialization dry-runs do not write files; apply mode refuses path collisions.
- Normal generated output is written only by the explicit build command.
- Validation and retrieval commands are read-only and suitable for CI or a local hook.
- The default adapter is `none`; it makes no source-fact claim and should not inspect external
  systems.
- Core operation does not require credentials, network access, a database, or a deployment target.

## Credentials and sensitive material

- Never put secrets, connection strings, access tokens, customer data, or production snapshots in
  templates, generated artifacts, session logs, retrieval baselines, or examples.
- Keep local credential files outside version control and ensure generated local observations are
  ignored before enabling an optional integration.
- Treat an adapter's configuration paths and output as potentially sensitive. Redact values; record
  only the minimum structural fact required for navigation or review.

## Optional extensions

An extension that queries a service, reads a database, or produces operational evidence must be
explicitly invoked and documented. It must have a narrow write boundary, a timeout, failure-safe
behavior, and a human review step. A measured signal is advisory; it must never automatically
change production configuration, budgets, user access, rollout state, or deployment behavior.

Review an extension's permissions, data scope, cache location, and failure modes before enabling
it in CI or developer workflows.

## Hooks and automation

Local hooks and CI integrations are conveniences, not the only enforcement path. They should run
read-only validation and fail clearly. Do not use a hook to regenerate files, connect to services,
or make project decisions. Any temporary exception needs an explicit, reviewed rationale rather
than a hidden environment switch.
