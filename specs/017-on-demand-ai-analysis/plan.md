# Implementation Plan: On-demand AI analysis

**Spec**: `spec.md` · **Created**: 2026-08-03 · **Status**: Draft

## Summary

A new `analysis` module: an `AnalysisProvider` port, a pure context builder that quarantines seller
text, a strict output validator, an immutable `AiAnalysis` record, a content-hash cache, a dedicated
budget allocation, and an admin-only `/analyze_ai` command plus an inline-button shortcut. Nothing
in it can reach the scorer.

## Technical Context

- **Module placement (decision):** a new `src/modules/analysis/` rather than an extension of
  `valuation/`. The physical separation is the enforcement of ADR-0019 §1 — `valuation` never
  imports `analysis`, so an accidental scoring dependency is a visible import in review, not a
  subtle data-flow bug. This is the same reasoning that keeps the SPEC-016 callback module free of
  `LISTING_SOURCE`.
- **Port (decision):** `AnalysisProvider` with `analyze(context): Promise<RawAnalysisResponse>`,
  DI token `ANALYSIS_PROVIDER`, one adapter per vendor. Contract-tested against recorded fixtures
  with an HTTP mock, exactly as the AUTO.RIA adapter is (Constitution VI).
- **Injection boundary (decision):** the prompt is a versioned template with a fixed instruction
  section and one substitution slot for a delimited untrusted block. Seller text is never formatted,
  trimmed into, or concatenated with instructions. A unit test asserts the property directly on the
  assembled string rather than trusting the template shape.
- **Why the boundary can be this simple:** because of FR-002, a successful injection produces at
  most a misleading advisory paragraph. There is no privileged action for it to reach. Defence in
  depth here is *containment of consequence*, not filtering of input — filtering seller text would
  be an arms race the system cannot win.
- **Output validation (decision):** schema plus range checks at the boundary
  (`advisoryScore` within range, severities from a closed set, no negative costs). Invalid output is
  discarded whole. No repair pass, no partial render — a half-parsed model answer is worse than none.
- **Cache key (decision):** `sha256(listingId, inputFactHash, promptVersion, modelId)`.
  `inputFactHash` covers price, description, and every source fact in the snapshot, so any material
  change invalidates it and no explicit invalidation path is needed. Cache is a lookup on the
  `AiAnalysis` table, not a separate store — one source of truth, and the audit trail is the cache.
- **Budget (decision):** a new operation code in the existing `BudgetActivity` ledger with its own
  monthly allocation, admitted atomically before the call like `valuation_ai`. It is a *separate
  allocation, not a share of the AUTO.RIA pool* — different currency, different ceiling. Reusing the
  ledger keeps `/budget` a single reporting surface.
- **Persistence:** one additive table, one additive migration (append-only, per project rule).
  Records are insert-only; a re-analysis inserts a new row.
- **Rendering:** its own formatter in `notifications/format/ai-analysis-message.ts`. Deliberately
  **not** merged into the SPEC-016 breakdown builder — ADR-0019 §8 requires the advisory score to be
  visually subordinate and separately labelled, which a shared renderer would erode over time.

## Constitution Check

- **I SDD:** spec → plan → tasks precede code. ✅
- **II Vault:** ADR-0019 accepted and the constitution amended (v1.2.0 → v1.3.0) in the same task. ✅
- **III Clean/simple:** one module, pure builder and validator, one entity. The port abstraction is
  justified by a real second case (AUTO.RIA provider already exists), not by anticipation. ✅
- **IV Ports & adapters:** the provider sits behind `AnalysisProvider`; domain logic is IO-free. ✅
- **V Limits & legality:** separate cap, disabled by default, per-admin rate limit; provider terms
  and lawfulness of sending listing content are explicit operator gates. ✅
- **VI Tests:** contract tests against recorded fixtures; injection and non-influence properties are
  asserted, not assumed. ✅
- **Operator test (ADR-0006 §6):** a good перекуп phones someone who knows that engine before
  driving across the city. This is that call, on demand. ✅

## Data Model

- New entity `AiAnalysis` (immutable, insert-only): `id`, `listingId`, `inputFactHash`,
  `promptVersion`, `modelId`, `samplingParams jsonb`, `factSnapshot jsonb`, `output jsonb`,
  `status`, `terminalReason`, `capturedAt`. Index on `(listingId, inputFactHash, promptVersion,
  modelId)` for the cache lookup, and on `capturedAt` for `/ai_audit`.
- One additive migration. **Append-only** — a new incremental migration, never a delete-and-
  regenerate.
- No change to `Listing`, `Opportunity`, `ParameterSet`, or `EvaluationExplanation`.

## Design & Phasing

### Phase F — Foundational: context, validation, and the non-influence guard (blocking)

Pure `analysis-context.ts` (assembly + `inputFactHash`) and `analysis-output.ts` (schema + range
validation), with the injection test and the non-influence regression test. **No network code in
this phase.** The guard test must exist before any adapter does.

### Phase 1 — US17.4 Budget, kill switch, rate limit

Allocation, operation code, per-admin limit, disabled-by-default config. Landing containment before
the call means the first live request cannot be unbounded.

### Phase 2 — US17.2 Provider, persistence, command

`AnalysisProvider` port + first adapter + contract fixtures; `AiAnalysis` entity and migration;
`/analyze_ai` behind `isAdmin`; the renderer.

### Phase 3 — US17.3 Cache

Lookup on the composite key before admission; cached replies marked with the original capture time.

### Phase 4 — US17.5 Audit

Admin-only `/ai_audit` with status, cache-hit rate, and spend. Inline-button shortcut under alerts
routing to the same path.

### Rollout / safety

- Ships **disabled by default** with a zero cap; enabling is an operator action after the provider
  terms gate.
- Every phase re-runs the SC-001 non-influence guard as its exit condition.
- A provider outage, bad key, exhausted cap, or invalid schema degrades to a single failed message;
  discovery, scoring, and alerts are untouched.
- Revertible by setting the cap to zero — no data migration needed to disable.

## Complexity / risk tracking

| Risk | Mitigation |
|---|---|
| Advisory output drifts into scoring | `valuation` never imports `analysis`; SC-001 bit-for-bit guard at every phase exit |
| Prompt injection via description | Delimited untrusted block asserted by test; consequence contained by FR-002 — there is no privileged action to reach |
| Advisory score acquires de-facto authority | ADR-0019 §8 presentation rules; warnings/checklist/questions rendered first |
| Runaway cost | Human-triggered only, monthly cap, per-admin rate limit, content-hash cache, disabled by default |
| Non-reproducible output | Immutable record with model id, prompt version, sampling params; rendering never re-calls |
| Hallucinated reliability claims | Labelled model-generated and unverified; contradictions with curated tables shown side by side, never auto-reconciled |
| Silent vendor model change | `modelId` recorded per attempt and part of the cache key |
| Prompt edits change behaviour invisibly | `promptVersion` is part of the cache key and the record; a prompt change is versioned like a `ParameterSet` |

## Related

- `spec.md` · [ADR-0019](../../knowledge-offers-analyzer/decisions/0019-advisory-only-ai-analysis.md) ·
  [ADR-0017](../../knowledge-offers-analyzer/decisions/0017-shadow-valuation-evidence.md) ·
  [ADR-0009](../../knowledge-offers-analyzer/decisions/0009-monthly-rate-limit-pool.md)
- Reuses: SPEC-009 budget ledger, SPEC-015 evidence discipline, `isAdmin` gate
- Constitution: v1.3.0 (new external-system class)
