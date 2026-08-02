# Research: Portable AI Infrastructure Kit

## Decision

Use a self-contained copy-and-own bootstrap kit, not a raw template clone, Git submodule, or
mandatory shared runtime dependency.

## Why

- A kit can evolve independently while each product owns its curated truth and policy.
- A `none` adapter supports docs-only and non-Node projects without fabricated source facts.
- Context control works through explicit documentation/commands in every agent runtime; runtime
  hooks remain ergonomic add-ons.

## Rejected alternatives

- **Copy the full Offers vault**: leaks product decisions and creates two sources of truth.
- **Make the TypeORM adapter universal**: hard-codes a backend data model into unrelated projects.
- **Central auto-sync/shared dependency**: causes surprise rule changes and upgrade drift before the
  kit has proven compatibility across projects.
- **Include live evidence as core**: introduces database coupling and accidental operational risk.
