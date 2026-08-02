# Optional plugins

The core installation deliberately starts with the null adapter and no external integrations.
Plugins are project-owned extensions for verified source facts, evidence collection, or other
capabilities that a project has explicitly chosen.

Rules for every plugin:

1. It must be installed and invoked explicitly; build, check, retrieval, and bootstrap do not
   discover or execute plugins automatically.
2. It must document its inputs, writes, failure mode, security constraints, and test strategy.
3. It must not make a product, rollout, policy, or deployment decision on its own.
4. It must keep secrets, live credentials, and local observation caches outside version control.
5. It must be removable without breaking the core curated-vault workflow.

The postgres-evidence directory is a contract for a future project-specific implementation. It
contains no executable database code.
