# Migration guide

Adopt the kit additively. It should reveal and organize existing knowledge before it makes new
rules blocking.

## New repository

1. Run `init --dry-run` and inspect every proposed file.
2. Run `init --apply` only into a target without collisions.
3. Replace the bracketed prompts in the new vision, requirements, invariants, and roadmap.
4. Keep the null adapter until there is a real source-fact need.
5. Run build and strict check, then add the project's ordinary quality commands.

## Existing repository

1. Inventory existing documentation, decisions, plans, and handoff material. Preserve useful
   history; do not bulk-delete it to make a template look tidy.
2. Choose a single canonical owner for vision, requirements, invariants, and delivery status.
   Link legacy material to those owners instead of creating parallel summaries.
3. Add the context zone as an inbox and historical record. Move only new working notes there;
   promote enduring content gradually.
4. Configure the core with the null adapter and generate a baseline. Resolve malformed metadata,
   broken curated links, and stale outputs first.
5. Add retrieval baselines for representative project questions. Keep integrity findings as
   warnings until they are understood and corrected.
6. Record a clean baseline before enabling strict CI or a local hook. Hooks remain optional and
   must never repair files or run operational actions.
7. Add a project-owned adapter, code pins, or evidence integration only after the core is healthy
   and a maintainer owns those surfaces.

## Collision and overwrite policy

Initialization is intentionally conservative: an existing target path is a collision, not an
invitation to overwrite it. Resolve collisions through a reviewed migration or manual merge. Do
not use the initializer as a bulk document formatter.

## Versioning and upgrades

Each installed project records the kit version it started from. To upgrade:

1. Read the kit changelog and compare the target's local changes with the new templates or core.
2. Apply only compatible changes in a dedicated review.
3. Regenerate derived output, run validation, and update local policy if its behavior changed.
4. Record the new version and any intentional deviations.

The kit deliberately does not pull updates into a project automatically.
