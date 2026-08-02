# Claude integration snippet

Add this to the target repository's policy after reviewing its existing instructions. It is
runtime-neutral on purpose: hooks may improve convenience, but manual commands remain required.

At task start, read the context handoff, run:

    node ai-infra/engine/v.mjs brief -- "<Roadmap note>"

Then navigate from the index through find and show before opening broad source.

At task close, record the dated context log, promote durable facts to the curated owner, and run
the following when generated inputs changed:

    node ai-infra/engine/v.mjs build
    node ai-infra/engine/v.mjs check --strict

Do not enable a hook merely by adding this text. Hooks are an explicit repository-owner choice.
