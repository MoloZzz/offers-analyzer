# Codex integration snippet

Add this to the target repository's existing AGENTS.md or equivalent operating guide. Keep
repository-specific instructions authoritative.

Use the L1-to-L4 knowledge flow: context handoff, index/roadmap, smallest owning note, then
focused implementation evidence. Prefer:

    node ai-infra/engine/v.mjs brief "<Roadmap note>"
    node ai-infra/engine/v.mjs find -- "<query>"
    node ai-infra/engine/v.mjs show -- "<note>#<section>"

Record each completed task in context/log/, promote durable facts out of context, and build plus
strict-check after a curated note, configuration, adapter, or source-fact surface changes.

No Codex feature is assumed to run this automatically; the direct Node commands are the baseline.
