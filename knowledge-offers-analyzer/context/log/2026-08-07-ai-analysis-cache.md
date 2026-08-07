---
title: SPEC-017 phase 4 — content-hash cache
type: context
updated: 2026-08-07
---

# SPEC-017 phase 4 — the content-hash cache (T026–T029)

Phase 4 of `017-on-demand-ai-analysis`, on top of the 2026-08-06 MVP
(`context/log/2026-08-06-on-demand-ai-analysis.md`). The feature still ships disabled; nothing here
touches an operator gate.

## What changed

`AnalysisService.analyze` now consults `ai_analyses` on the composite key
`(listingId, inputFactHash, promptVersion, modelId)` for the newest `status: 'available'` row, and
serves it as a `cached` attempt. The reply renders the stored answer marked as cached, carrying its
**original** capture time. Simultaneous taps are single-flighted in process.

## Decisions

**The cache is checked before the kill switch, not just before admission.** T027 only requires
"before budget admission" so a hit charges nothing. Putting it ahead of the enabled/configured check
as well is what makes a stored analysis render in full with the provider disabled and no network —
SC-005, and the same contract `/why` already has with SPEC-015 evidence. A hit reads nothing but our
own table, so there is no cost or legal exposure to gate. Worth knowing the trade: an operator who
flips the kill switch still sees previously-produced answers on request. That is the intended
reading of "rendering always reads the record" (FR-009), not an oversight.

**A cache hit writes no new row.** The record it serves *is* the record of that analysis; inserting
a copy per tap would inflate `/ai_audit`, duplicate the stored `output` jsonb, and make "one
immutable record per attempt" (SC-006) mean something weaker. **Consequence for phase 5:**
`/ai_audit` is specified to report a cache-hit *rate*, and hits are currently uncounted. T031 has to
decide where invocations are recorded — a zero-cost ledger entry, a counter, or a `servedFromCache`
marker row — before that number can exist. Flagged in `tasks.md`; deliberately not decided here.

**Failed attempts are never cached.** Only `status: 'available'` rows satisfy the lookup. A timeout
or a schema violation says nothing about the listing, and re-serving one would turn a transient
provider fault into a permanent verdict on a car.

**No explicit invalidation path exists, by design.** `inputFactHash` covers price, description, and
every source fact, so a changed listing simply misses. A `promptVersion` or `modelId` change misses
for the same reason: that answer would have been produced under different rules. There is no cache
to purge and no TTL to tune.

**Single-flight is in-process and keyed by the full cache key**, mirroring
`ValuationEvidenceService.maybeCapture`. The risk being covered is two admins tapping the same alert
within the same second on one bot instance — not a fan-out across workers, which this deployment
does not have. Keying on anything less than the full cache key would let one listing's answer
satisfy another's request.

## One test defect avoided

The two concurrency tests first hung on a fixed-tick microtask drain — the same failure the
2026-08-04 entry records against `valuation-evidence.service.spec.ts`. `analyze()` sits behind the
listing lookup, the cache lookup and budget admission, and the number of awaits before it is not the
test's business to know. The harness now drains until the provider has actually been entered
(`providerReached`), then joins the second caller.

## Verification (native Windows `npm.cmd`; the RTK wrapper is Linux/musl and does not run here)

`typecheck`, `lint`, unit Jest **652/652** (74 suites), contract Jest **108/108**, `nest build` —
all pass. T008, the non-influence guard, was re-run as the phase exit condition and is unchanged.

`test/unit/analysis-service.spec.ts`'s repository double needed a `findOne` stub returning null —
its cases are cache misses by construction; the cache is `test/unit/analysis-cache.spec.ts`'s
subject.

## Related

[[0019-advisory-only-ai-analysis|ADR-0019]] · `specs/017-on-demand-ai-analysis/` ·
[[Roadmap & Status]] · [[architecture/overview]]
