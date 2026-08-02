# Adapter contract

Adapters are optional, project-owned modules that expose verified source facts to the portable
engine. The default `none` adapter is the correct choice for documentation-only projects and for
projects that have not yet defined a trustworthy extraction surface.

## Behavioral contract

An adapter must:

- Declare the facts or capabilities it supports before returning them.
- Read only explicit, local project sources named by its configuration or contract.
- Return deterministic, reviewable output and omit unsupported capabilities.
- Fail clearly when it cannot prove a fact it claims to provide; it must never guess.
- Avoid network access, credential loading, database connections, generated-file writes, and
  production side effects during ordinary build/check use.
- Have focused fixture tests that show both a successful extraction and an unprovable input.

## Capability design

Keep capabilities generic. Examples include a navigable code map, a list of declared quality
commands, an environment-key inventory, or a project-defined source-fact table. A capability is
optional: absence means the generated output omits that surface rather than inventing a shape.

Do not turn one application's object model into a required core schema. A project may define a
small adapter that understands its own language, build system, or data model, while another project
can continue using `none`.

## Adoption sequence

1. Start with `none` and validate the curated knowledge flow on its own.
2. Identify one narrow, stable source-of-truth surface worth exposing.
3. Document the ownership and expected facts in the target repository.
4. Implement a capability with fixtures and failure behavior.
5. Add only narrow reviewed code-to-note relationships after the facts are trusted.
6. Keep findings advisory until the target has a clean, understood baseline.

An adapter is a navigation and drift-detection aid. It is not authority to alter application
behavior or replace code review.
