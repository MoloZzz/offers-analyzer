---
title: Vault Protocol — how agents use and maintain the knowledge base
type: meta
updated: 2026-07-12
---

# Vault Protocol (read + maintain)

This vault is a **second brain**, not a passive wiki. It is the primary navigation layer for the project. These rules are enforced by `../CLAUDE.md`.

## Why this instead of RAG

On a small project, vector RAG is overkill and imprecise. A curated, hand-linked Obsidian vault gives agents a deterministic, high-signal map: fewer tokens, no retrieval noise, and human-auditable. Navigation is by explicit `[[links]]`, not similarity search.

## Read protocol (every task, before touching code)

1. Open [[00-INDEX]] first.
2. Follow the MOC into the area you're working on.
3. Trust the notes to tell you *where* the relevant code and decisions are; use them to jump straight to the right files instead of broad grepping.
4. If a note is missing or contradicts the code, that's a defect — fix the note as part of your task.

## Write protocol (every task, after changing code)

Updating the vault is part of "done." A change is not complete until the knowledge base reflects it. Specifically:

- **New module / feature** → update [[overview|Architecture overview]] and add/adjust the relevant MOC links.
- **New domain concept or rule** → add it to [[glossary|Domain glossary]].
- **Non-trivial decision** (library choice, pattern, tradeoff) → add an ADR via [[decisions/README|the decision log]].
- **New convention or pattern** → record it in [[coding-standards]].
- **New tool / env / runbook step** → update [[environment-setup]].
- **New spec** (Spec Kit) → link it from [[specs/README]].

## Note conventions

- One concept per note. Prefer many small linked notes over few large ones.
- Link liberally with `[[note-name]]`. A link to a not-yet-created note is a valid TODO marker.
- Every note carries frontmatter: `title`, `type`, `updated` (ISO date). Bump `updated` when you edit.
- Use `TODO:` inline for known gaps. Never invent facts to fill a skeleton — leave the TODO.
- Keep prose tight. This is working memory, not documentation theater.

## Note types

`moc` (map of content) · `meta` · `architecture` · `domain` · `decision` · `convention` · `operations` · `spec`.

See [[note-template]] for the starting shape of a new note.
