# Data Model: Portable AI Infrastructure Kit

## Manifest

`manifest.json` records the kit name, semantic version, supported Node version, profiles, and
public commands. It is kit-owned and read by `doctor`.

## Target configuration

`vault.config.json` is target-owned. It binds the generic engine to a vault directory, index,
roadmap, context zone, quality commands, and an optional adapter. It may not contain absolute paths
or donor project identifiers.

## Template tokens

Templates use explicit `{{TOKEN}}` placeholders such as `{{PROJECT_NAME}}`, `{{VAULT_DIR}}`, and
`{{DATE}}`. The initializer reports unresolved required tokens rather than guessing product facts.

## Adapter capabilities

An adapter may export `capabilities()` and named optional functions. The core consumes only
declared capabilities, so unsupported source facts are omitted. `none` declares no facts.
