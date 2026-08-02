# Implementation Plan: Defensible valuation evidence

**Branch**: 015-defensible-valuation-evidence | **Date**: 2026-08-02 | **Spec**: [spec.md](spec.md)

## Summary

Introduce a separate, first-party AUTO.RIA AI valuation-provider path that records an immutable,
target-labelled active-market asking-price evidence snapshot. It runs in a controlled shadow sample
or on an explicit manual check, uses the shared rate budget and a feature allocation, and does not
read or alter the legacy price core. The implementation gives /why a persisted provider evidence
block and gives administrators a read-only audit; it deliberately does not claim a sale price or
change any alert decision.

The design separates three concerns that are currently conflated by the legacy benchmark:

1. The existing legacy cohort median is a score input and remains unchanged.
2. Provider evidence is a timestamped external market-position estimate.
3. A future resale model needs confirmed deal outcomes and is not part of this feature.

## Technical Context

**Language/Version**: TypeScript 5.5, Node.js, NestJS 10
**Primary Dependencies**: NestJS, TypeORM, PostgreSQL, undici, nestjs-pino, Telegraf
**Storage**: PostgreSQL JSONB plus additive TypeORM migrations
**Testing**: Jest unit and service tests; nock/fixtures for provider contract tests
**Target Platform**: Existing NestJS service and Telegram operator interface
**Project Type**: Single NestJS service
**Performance Goals**: No added latency on the existing poll/alert path; shadow lookup runs after
legacy evaluation and is bounded, deduplicated, and asynchronous. Stored /why lookup adds zero
source requests.
**Constraints**: Official provider only; source calls are budget-gated; paid provider disabled by
default; no raw credentials or unnecessary personal data at rest; no production score change.
**Scale/Scope**: One AUTO.RIA source, a small deterministic shadow sample plus manual checks, and
a bounded gold-case audit corpus. The feature must remain within a configured monthly provider
allocation in addition to the existing source pool.

## Architecture and Design Decisions

### D1 - Use a dedicated ValuationProvider port

Do not overload ListingSource.averagePrice. That method represents the deprecated legacy cohort
endpoint and its result is intentionally narrow. Add a second port under the existing sources
module:

- ValuationProvider accepts a normalized listing-fact snapshot and returns a typed provider
  outcome.
- AutoRiaAiValuationProvider implements the official paid POST AI valuation endpoint.
- The port supports query modes omni_id and attributes. The policy prefers omni_id for a known
  AUTO.RIA listing ID. Attribute mode is rejected before a request when required facts, including
  actual mileage, are missing.
- The adapter normalizes only documented/fixture-pinned response fields: provider estimate,
  currency, source timestamp, statistics, and permitted comparable summary. It does not calculate
  a substitute average if the provider estimate is absent.
- No AI failure falls through to the legacy average-price endpoint. Legacy evidence remains an
  explicitly separate reference.

This keeps AUTO.RIA ingestion and scoring backward compatible while allowing a provider contract
to change under a pinned adapter version.

### D2 - Preserve a richer immutable listing-fact snapshot

Extend the AUTO.RIA listing-detail mapping to retain existing source facts that are currently
discarded but already present in the official info response: generation and modification IDs/names,
body, fuel, gearbox, drivetrain, mileage, location, and provider-compatible IDs. Preserve each
field's availability/provenance, not an inferred substitute.

Description-derived condition signals are captured as local condition evidence only. They are not
sent as an invented provider field when the provider contract does not support them. This change
does not alter legacy cohort construction, mileage adjustment, or score inputs.

### D3 - Store immutable evidence, not a replacement score

Create an additive valuation_evidence table. It is append-only once terminal and is the durable
audit record for available, disabled, invalid, deferred, and unavailable outcomes. Each record
contains:

- source and target identifiers;
- a policy and adapter version;
- a redacted immutable input snapshot, canonical request fingerprint, query mode, selection reason,
  and freshness bucket;
- terminal status/failure code and timestamps;
- provider estimate/statistics/comparable summary only when valid;
- input completeness, material relaxations, comparability decision/reasons, and legacy-reference
  delta;
- response fingerprint and a retention-safe projection, never a secret-bearing URL or raw
  credentials.

A nullable latest evidence pointer on Listing is a convenience projection. An Opportunity points
to the precise evidence used during its surrounding evaluation, but neither pointer replaces the
legacy explanation. Existing Listing.lastExplanation and Opportunity.explanation remain compatible
projections; explanation schema V2 gains a nullable provider-evidence reference and V1 continues to
render unchanged.

### D4 - Keep policy separate from scoring ParameterSet

Seed a code-owned, immutable valuation-policy version named ai-shadow-v1 in a new
valuation_policy_versions table. The row contains target, hard facts, attribute-query requirements,
allowable relaxations, freshness, deterministic sampling rule, and discrepancy buckets. Evidence
stores both the policy snapshot/key and the legacy ParameterSet version if a legacy evaluation is
associated with it.

This prevents later provider-policy changes from being mistaken for ParameterSet tuning. There is
no policy editing UI in this feature; a new policy is added as a new immutable version and selected
through controlled configuration.

### D5 - Make source and budget behavior explicit

Add a distinct BudgetOperation named valuation_ai. Every provider attempt, including a retry,
passes the common RateBudgetService and is written to BudgetActivity. Add an operation allocation
gate with an atomic per-month counter so AI shadow traffic cannot consume protected discovery
capacity even if the source-level pool is still available.

The initial configuration is disabled and has a zero sample rate/allocation. When enabled, automatic
selection is deterministic by a stable hash of listing external ID plus policy version. Manual
checks are separately budgeted and never bypass the cap. Concurrent identical requests share a
single-flight key comprising provider, query mode, canonical input fingerprint, policy version,
period, and freshness bucket. Failure charge status is stored as charged, not_charged, or unknown
until an operator reconciles it.

### D6 - Surface stored evidence only

The poll path evaluates and persists the unchanged legacy result first. It schedules/adopts the
shadow sidecar only after the legacy path has finished; provider completion must not delay, block,
or modify a legacy alert. The shadow service writes evidence and updates only the latest-evidence
projection. A provider persistence failure is logged and visible as unavailable; it must not create
or suppress an Opportunity.

QueryService /why loads stored V1/V2 explanation plus the latest linked evidence without a source
request. A concise Ukrainian evidence block names the provider estimate, time, query mode,
completeness, quality state, and clear warning that it is not a confirmed sale price. An
admin-only /valuation_audit command reads stored records only and makes no provider call.

### D7 - Audit for parity and future readiness, not false accuracy

Use a tracked gold-case fixture/registry with a deterministic set of exact AUTO.RIA listing IDs and
manual contemporaneous public-calculator observations where authorized. It must cover the required
strata and retain capture time/source, not a claim of completed-sale truth. The audit reports:

- selected-versus-eligible coverage and strata;
- provider success, timeout, schema, permission, and budget outcomes;
- ID-versus-attribute lookup share and missing-fact rates;
- comparison of provider central estimate against legacy benchmark by stratum;
- decision states and >=20% differences for review;
- cost, retries, cache/dedup, allocation, and charge reconciliation.

An unexplained provider-to-public-calculator mismatch blocks a future activation proposal. It does
not automatically invalidate or update the current production score.

## Constitution Check

- **Spec-driven workflow**: Pass. This spec, plan, data model, contracts, quickstart, and tasks
  precede implementation.
- **Zero-budget bias**: Pass. The paid provider is disabled by default, selected deterministically,
  has a dedicated allocation, uses cache/dedup, and runs through the existing budget ledger.
- **Explainable decisions**: Pass. Evidence captures exact target, inputs, query mode, policy,
  source response projection, quality decision, and legacy delta; /why is source-free.
- **Tunable only through governed parameters**: Pass. This introduces a distinct immutable
  valuation policy; it does not alter ParameterSet or activate factors.
- **Graceful degradation**: Pass. Any source/config/budget/schema failure becomes a visible
  terminal state while legacy discovery and alerts continue unchanged.
- **Reversible rollout**: Pass. The feature is shadow-only, disabled by config, writes additive
  evidence, and has no production scoring dependency.
- **Official-source and secret handling**: Pass. The provider is official/permissioned; no scraping,
  credentials, raw VIN/plate, or unnecessary personal data is retained.

## Project Structure

### Documentation

    specs/015-defensible-valuation-evidence/
    |- spec.md
    |- plan.md
    |- research.md
    |- data-model.md
    |- quickstart.md
    |- contracts/
    |  |- auto-ria-ai-valuation.md
    |  |- valuation-evidence.md
    |  |- operator-audit.md
    |- checklists/requirements.md
    |- tasks.md

### Source Code

    src/
    |- common/
    |  |- config/configuration.ts
    |  |- database/data-source.ts
    |  |- database/migrations/
    |- modules/
    |  |- sources/
    |  |  |- ports/listing-source.port.ts
    |  |  |- ports/valuation-provider.port.ts
    |  |  |- auto-ria/auto-ria.source.ts
    |  |  |- auto-ria/auto-ria-ai-valuation.provider.ts
    |  |  |- sources.module.ts
    |  |- valuation/
    |  |  |- entities/valuation-evidence.entity.ts
    |  |  |- entities/valuation-policy-version.entity.ts
    |  |  |- valuation-evidence.service.ts
    |  |  |- valuation-policy.ts
    |  |  |- comparability.ts
    |  |  |- evaluation-explanation.ts
    |  |  |- valuation.module.ts
    |  |- scheduling/
    |  |  |- entities/operation-budget-state.entity.ts
    |  |  |- entities/budget-activity.entity.ts
    |  |  |- rate-budget.service.ts
    |  |- polling/poll.service.ts
    |  |- query/query.service.ts
    |  |- notifications/
    |     |- format/why-message.ts
    |     |- telegram/telegram-bot.update.ts
    test/
    |- contract/auto-ria-ai-valuation.spec.ts
    |- unit/valuation-evidence.spec.ts
    |- unit/comparability.spec.ts
    |- unit/valuation-policy.spec.ts
    |- unit/rate-budget.spec.ts
    |- unit/why-message.spec.ts
    |- unit/query-service.spec.ts
    |- unit/poll.service.spec.ts
    |- fixtures/valuation-gold-cases.json

**Structure Decision**: Reuse the existing NestJS sources, valuation, scheduling, polling, query,
and notification modules. The provider adapter lives beside the existing AUTO.RIA adapter; business
policy and persistence live in valuation; source-budget admission remains centralized in scheduling.

## Implementation Phases

### Phase 0 - Provider and policy readiness

1. Confirm AUTO.RIA AI permission, user identifier, pricing/allocation, retention and attribution
   terms, and response schema with non-production credentials.
2. Add contract fixtures for success, no data, auth/permission failure, 429, timeout, 5xx, and
   malformed data before adapter wiring.
3. Seed ai-shadow-v1 and the gold-case registry. Do not enable provider calls in production.

### Phase 1 - Foundational shadow evidence

1. Add source-fact mapping and typed provider port/adapter.
2. Add immutable evidence/policy entities, registry, additive migration, operation allocation gate,
   redaction, request fingerprinting, and single-flight dedupe.
3. Add pure input-validation, comparability, response-normalization, and V1/V2 explanation code.
4. Verify migration has a symmetric down path and re-generation causes no schema churn.

### Phase 2 - Sidecar capture and operator explanation

1. Add deterministic shadow selection and manual-check invocation after existing legacy evaluation.
2. Persist terminal evidence without modifying score/Opportunity/notification behavior.
3. Link evidence to Listing/Opportunity projections and render stored provider evidence in /why.
4. Add distinct budget activity observability and read-only admin status/audit command.

### Phase 3 - Shadow audit and release evidence

1. Run a controlled, low-volume shadow sample after explicit provider enablement.
2. Produce the parity/coverage/cost report over the gold-case corpus.
3. Classify every review/unavailable/deferred and >=20% discrepancy.
4. Keep the feature in shadow unless a separate operator-approved activation proposal meets
   ADR-0011, source-parity, budget, and actual-outcome evidence gates.

## Verification Strategy

- Contract tests pin official endpoint path/method, request projection, response mapping, redaction,
  timeout/retry classification, and no legacy fallback.
- Pure unit tests cover query-mode validation, deterministic sampling, fingerprinting, input
  completeness, comparability decisions, response normalization, status transitions, and
  Ukrainian explanation labels.
- Service tests cover allocation/budget admission, idempotent dedupe, immutable terminal evidence,
  Listing/Opportunity links, manual-check behavior, and /why with no source call.
- Poll regression tests prove source-sidecar behavior leaves all legacy fair-value/score/alert
  outputs unchanged.
- Migration tests run generate, apply on development database, and generate again with no churn.
- Run typecheck, lint, unit tests, provider contract tests, vault build, and strict vault check.

## Risks and Rollback

- **Provider entitlement or schema is unavailable**: leave feature disabled; contract readiness
  remains incomplete. No legacy behavior changes.
- **Provider cost or rate usage exceeds forecast**: set shadow sample/allocation to zero; existing
  provider evidence remains readable.
- **Provider/public-calculator divergence**: classify as source-parity failure and block activation;
  do not tune scores to force agreement.
- **Stored evidence is too large or contains prohibited data**: retain only normalized fields and a
  digest; add storage tests before any production enablement.
- **A future policy proves bad**: select a prior immutable policy or disable shadow; never mutate
  old evidence or ParameterSets.
