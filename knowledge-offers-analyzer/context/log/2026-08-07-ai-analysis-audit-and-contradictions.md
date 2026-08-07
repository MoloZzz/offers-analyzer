---
title: SPEC-017 phase 5 — audit, inline button, contradiction display
type: context
updated: 2026-08-07
---

# SPEC-017 phase 5 — `/ai_audit`, the inline button, contradictions (T030–T033)

Closes `017-on-demand-ai-analysis`. The feature still ships disabled and the migration is still
unapplied; every operator gate in T037 remains untouched.

## The decision phase 4 deferred, now made

Phase 4 recorded that **a cache hit writes no row** — the record it serves is the record of that
analysis. That was cheap and defensible, and it left `/ai_audit`'s specified **cache-hit rate** with
no source: the cheapest invocations were the only invisible ones.

**Reversed here.** A hit now writes a `cached` **marker** row: same cache key, `output: null`,
`terminalReason: 'ok'`, carrying the admin who asked. Why this over the alternatives:

- *A zero-cost `BudgetActivity` row* would put a non-spend event in the spend ledger and inflate
  `/budget`'s "виконано" count, which is a worse lie than the one it fixes.
- *A counter* would be a second source of truth about invocations, reconcilable with nothing.
- The marker keeps FR-008 literally true — **every invocation has exactly one immutable record** —
  and keeps the audit computable from one table. It costs one small row per tap and duplicates no
  `output` jsonb. **No schema change**: `status` is an existing varchar column.

Markers cannot satisfy a lookup, which filters on `status: 'available'`. The rate is
`cached / (cached + provider attempts)`; refusals are excluded, because a refused tap never asked
the provider anything and counting it would deflate the rate with events the cache could not serve.

## Other decisions

**The contradiction rule is asymmetric, and MEDIUM is not compared.** Two disagreements are worth an
operator's attention: the table says LOW and the model raises a high-severity warning (the long-tail
case the whole feature exists for), and the table says HIGH while the model raises nothing above
`low` (an operator reading only the AI reply would miss a warning the system already had). A mid tier
disagreeing with a mid severity is noise; inventing a threshold there would manufacture conflicts
rather than report them. Both sides are rendered, the conflict is named, and **nothing is
reconciled** — `analysis-contradiction.ts` imports the curated table's *reader* and nothing that
writes, so there is no path from a model claim into the table (FR-011, ADR-0019 §7).

**Contradictions are computed at reply time, not stored.** The curated table is versioned config a
human edits, so the honest question is "does this answer disagree with the table as it stands now",
not "as it stood when the answer was produced" — a stored analysis stops being flagged once the
table catches up.

**Only make/model resolution is available.** A stored `Listing` carries no engine, gearbox or fuel,
so the table's pattern rules cannot be evaluated from persisted data. `resolveRepairRiskTier` was
extracted out of `repairRiskFactor` (same resolution order, verbatim) so a reader can consult the
table **without** taking a scoring modifier with it. Where the table has no opinion, the display says
nothing rather than fabricating a tier.

**`HeuristicTablesService` is provided directly in `AnalysisModule`, not imported from
`ValuationModule`.** Importing that module would drag `SourcesModule` — and therefore
`LISTING_SOURCE` — into this injector, making a source request *reachable* from a feature that must
never make one. Same reasoning that keeps the spec-016 callback module clean. The cost is a second
instance reading the same versioned JSON at boot.

**The inline button has its own plumbing and its own prefix (`ai:`), separate from spec 016's
`details:`.** They look alike and are not: `Деталі` is free and open to every subscriber, this one is
admin-only and spends money. Sharing plumbing would invite the next reader to assume they share a
cost and permission model. It is attached **per recipient** — only admin chats get the row — and the
handler gates again for a forwarded message or a shared chat.

`AnalysisService.analyze` now accepts either an `externalId` (a pasted link) or a `listingId` (the
button), resolving both to the same listing and the same cache key, so the two entry points cannot
diverge.

## Verification (native Windows `npm.cmd`; the RTK wrapper is Linux/musl and does not run here)

`typecheck`, `lint`, unit Jest **688/688** (77 suites), contract Jest **108/108**, `nest build` —
all pass. T008, the non-influence guard, re-run as the phase exit condition and unchanged.

The T030 provider double **throws** rather than returning a failure: a politely-unavailable provider
would let a quiet call pass the test, which is the one outcome that test exists to rule out.

Three existing specs needed constructor updates (`NotificationsService` gained a `ConfigService`;
the analysis harnesses gained `HeuristicTablesService`), and one contradiction test had to call the
detector directly — passing `undefined` through a helper with a default parameter silently reinstated
the table.

## Related

[[0019-advisory-only-ai-analysis|ADR-0019]] · `specs/017-on-demand-ai-analysis/` ·
`context/log/2026-08-07-ai-analysis-cache.md` · [[Roadmap & Status]] · [[architecture/overview]]
