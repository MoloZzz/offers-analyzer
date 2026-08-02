# Requirements Checklist: Portable AI Infrastructure Kit

**Purpose**: Verify the implementation remains portable, safe, and free of Offers-specific content.
**Created**: 2026-08-02
**Feature**: [../spec.md](../spec.md)

## Scope

- [x] CHK001 The engine works with `adapter: none` and does not require TypeORM or PostgreSQL.
- [x] CHK002 Templates contain placeholders, not current Offers facts or historical context.
- [x] CHK003 Initializer dry-run writes nothing and apply refuses collisions.
- [x] CHK004 Hooks, CI, adapters, and evidence are opt-in.
- [x] CHK005 Build/check and docs-only fixture validation are automated.
- [x] CHK006 Current project governance records the kit decision and implementation.
