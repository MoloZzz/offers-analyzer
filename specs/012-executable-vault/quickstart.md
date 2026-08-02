# Quickstart: Executable Hybrid Knowledge Vault

## Preconditions

- Use Node.js 20 or newer from the repository root.
- Keep `knowledge-offers-analyzer/` and its existing Markdown frontmatter intact.
- Do not place secrets, production output, or a live database dump in the vault.

## Build the derived context

```bash
npm run vault:build
```

The command may update only `knowledge-offers-analyzer/_gen/` and declared generated blocks. Run
it a second time; it should report that the generated content is already current.

## Validate safely

```bash
npm run vault:check:strict
```

This runs the executable and legacy vault checks and treats every finding as a failure. It must
never write files. A stale generated artifact is fixed by running `npm run vault:build`, not by
re-running the check. Use non-strict `vault:check` only when observing a new rule or baseline.

## Retrieve task context progressively

```bash
npm run vault:brief -- "Roadmap & Status"
npm run vault:find -- "monthly API budget"
npm run vault:show -- "Roadmap & Status#current"
```

Use the full Markdown file only when editing it. Before changing application source, read the
generated code map named by the brief rather than beginning with a repository-wide search.

## Runtime behavior

Codex and other runtimes use the explicit commands above plus `context/CURRENT.md`. Claude Code
hooks, if installed later, are a convenience and do not replace the manual protocol.

## Evidence (optional)

```bash
npm run vault:evidence -- --dry
```

The dry run validates the metric registry without connecting to a database. A real evidence run is
read-only and advisory; it cannot activate scoring, profiles, budgets, or production settings.
