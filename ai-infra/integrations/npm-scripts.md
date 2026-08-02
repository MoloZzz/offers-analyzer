# npm scripts (optional)

Merge the following entries into the target repository's existing package.json. They use direct
Node commands, so the knowledge-system core does not require npm to operate.

    {
      "scripts": {
        "ai:build": "node ai-infra/engine/v.mjs build",
        "ai:check": "node ai-infra/engine/v.mjs check",
        "ai:check:strict": "node ai-infra/engine/v.mjs check --strict",
        "ai:find": "node ai-infra/engine/v.mjs find",
        "ai:show": "node ai-infra/engine/v.mjs show",
        "ai:brief": "node ai-infra/engine/v.mjs brief",
        "ai:map": "node ai-infra/engine/v.mjs map"
      }
    }

Do not add an evidence command unless the project explicitly adopts and implements an evidence
plugin. Do not make build a hidden side effect of check, tests, or commit hooks.
