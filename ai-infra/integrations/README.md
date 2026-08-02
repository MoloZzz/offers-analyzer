# Optional integrations

The portable kit works with direct Node commands alone:

    node ai-infra/engine/v.mjs build
    node ai-infra/engine/v.mjs check --strict

After installation, verify the target without writing:

    node ai-infra/bin/ai-infra.mjs doctor --target .

Nothing in this directory is installed or enabled by ai-infra init. Copy and adapt an integration
only after the target repository has a clean generated-artifact baseline.

- npm-scripts.md is a JSON fragment for Node-based repositories.
- github-actions-quality.yml is a workflow example for repositories using GitHub Actions.
- hooks/pre-commit is an optional POSIX hook that must be enabled deliberately.
- agents/ contains small instructions to merge into a repository's existing agent policy.

Do not copy an integration wholesale if it conflicts with the repository's package manager, CI
provider, shell, security policy, or agent runtime.

The policy templates remain in the source kit under templates/policy/. The initializer does not
install them at a target root because AGENTS.md and CLAUDE.md are repository-owned files and
silently creating or replacing them would be unsafe. Use the agent snippets as a reviewed,
manual integration instead.
