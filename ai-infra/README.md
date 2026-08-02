# Portable AI Infrastructure Kit

A copy-and-own starter kit for maintaining a small, reviewable project memory alongside code.
It combines a curated knowledge base, an isolated session-context area, progressive retrieval, and
lightweight governance templates. It is designed to work across agent runtimes without relying on
automatic hooks or a hosted service.

The kit is intentionally a starting point, not a second source of truth for a project. After
initialization, the target repository owns its notes, configuration, generated artifacts, and
local policy. Review upgrades deliberately rather than synchronizing them automatically.

## What it provides

- A canonical product hierarchy: vision, requirements, invariants, roadmap, decisions, and specs.
- A context zone for handoffs, session logs, drafts, and historical material that is kept out of
  curated graph and search truth.
- A progressive L1-to-L4 operating model: orient, map, read the owner, then verify focused code.
- A build-only generated-output path and read-only validation/retrieval path.
- Neutral templates, a null source adapter, and opt-in integration guidance.

## Start here

From a repository that contains this kit, inspect a target before writing anything:

```sh
node ai-infra/bin/ai-infra.mjs init --target /path/to/project --dry-run
node ai-infra/bin/ai-infra.mjs init --target /path/to/project --apply --project-name "Project Name"
```

After reviewing and completing the installed placeholders, work from the target repository:

```sh
node ai-infra/engine/v.mjs build
node ai-infra/engine/v.mjs check --strict
```

The default installation has no project source adapter, hook, CI workflow, network access, or
database measurement. Add those only when the project needs them and someone owns their upkeep.

## Operating model

The durable loop is:

```text
Vision -> requirements and guardrails -> roadmap/evidence -> spec and decision
       -> implementation and verification -> session record -> promote durable learning
       -> revise the owning product note when learning changes it
```

Read [the operating model](docs/operating-model.md) before changing the templates. For existing
repositories, use the additive, warning-first [migration guide](docs/migration.md). See
[security boundaries](docs/security.md) and the [adapter contract](docs/adapter-contract.md) before
adding integrations.

## Layout

```text
ai-infra/
  engine/       portable retrieval and validation runtime
  templates/    clean-room project files copied by the initializer
  docs/         operating, migration, security, and extension guidance
  integrations/ optional CI, hook, and agent snippets
  plugins/      opt-in integrations that are not part of the core
  bin/          collision-safe bootstrap and diagnostic commands
```

## Deliberate non-goals

- It does not replace project documentation with a vector database or a central service.
- It does not make product decisions, run deployment actions, or infer source facts.
- It does not require a particular programming language, package manager, agent client, CI system,
  database, or source-control host.
- It does not auto-update installed projects.

The public surface and compatibility promises are listed in [manifest.json](manifest.json). The
installed kit version should be recorded in each target's configuration or task record.
