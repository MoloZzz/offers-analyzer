# Operating model

The kit separates durable project truth from working memory. The distinction is more important
than the file names: a contributor should be able to identify one owner for a fact and one bounded
path to retrieve it.

## Canonical owners

| Concern                                         | Canonical owner         | Not an owner                  |
| ----------------------------------------------- | ----------------------- | ----------------------------- |
| Product outcome, user, scope, non-goals         | Product vision          | Session log or ticket comment |
| Product obligations and release gates           | Requirements            | Implementation detail         |
| Properties that survive refactors               | Architecture invariants | A single test alone           |
| Priority, current state, blocker, exit evidence | Roadmap                 | Backlog dump or handoff       |
| Durable trade-off                               | ADR                     | Informal discussion           |
| Feature contract and delivery plan              | Spec package            | Roadmap summary               |
| Current session and historical working notes    | Context zone            | Curated graph truth           |

If a fact is intentionally repeated for readability, link to its owner and keep the owner
authoritative. When a decision changes, search for old statements and update every durable
duplicate in the same change.

## Progressive retrieval

Use the smallest layer that can answer the task.

| Level | Purpose                                  | Typical action                                                                                 |
| ----- | ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| L1    | Orient to the active mission and handoff | Read `context/goals.md`, `context/CURRENT.md`, and the latest log; use `brief` when available. |
| L2    | Locate an owner                          | Open `00-INDEX.md`, a map of content, or use `find`.                                           |
| L3    | Read the rule or plan                    | Use `show` for one note or section.                                                            |
| L4    | Verify implementation evidence           | Open only the focused source, test, configuration, or external evidence needed for the change. |

Generated briefs and maps make L1/L2 faster; they are not a replacement for reviewed notes. A
runtime integration may help, but the explicit commands remain the portability baseline.

## Product and learning loop

1. State the durable product outcome in the vision.
2. Turn it into user-facing requirements and refactor-resistant guardrails.
3. Make the current priority, evidence needed, and blockers visible in one roadmap.
4. For a non-trivial change, create a spec; record consequential trade-offs in an ADR.
5. Implement and verify the change against its requirements and quality gates.
6. Record the session handoff and promote durable discoveries to their canonical owner.
7. Revisit vision, requirements, invariants, and roadmap when evidence changes the project
   direction. Do not let a session log become the new authority by accident.

This is a feedback loop, not a documentation ceremony. It should stay small enough that a team
maintains it.

## Context-control rules

The `context/` directory is intentionally outside the curated graph and ranked retrieval corpus.
It holds orientation, an overwriteable current handoff, dated logs, drafts, and retained history.
Curated notes do not use it as a source of product truth.

At task close, promote durable conclusions into the appropriate owner. Keep the context record as
history and link to the owner rather than copying a second roadmap, requirements list, or decision
record there.

## Completion discipline

Before considering work complete:

1. Update the owning curated note, spec, ADR, or operating guide when the change is durable.
2. Record the concrete work and handoff in a dated context log.
3. Run the explicit build if inputs to generated knowledge changed.
4. Run read-only validation and the project-appropriate quality checks.
5. If a decision changed, complete the supersession sweep before handoff.
