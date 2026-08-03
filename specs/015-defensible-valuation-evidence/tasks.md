# Tasks: Defensible valuation evidence

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts](contracts/), and [quickstart.md](quickstart.md)

**Tests**: Required. The project constitution requires core business logic and source contracts to be
tested before implementation. Every provider test must use authorized/sanitized fixtures only.

**Organization**: Tasks are grouped by user story. A task with [P] can be worked on in parallel
only after its stated prerequisites are complete.

## Phase 1: Setup and controlled fixtures

**Purpose**: Establish provider contract evidence and the zero-call default before runtime work.

- [x] T001 [P] Add sanitized success/no-data/auth/permission/429/timeout/5xx/schema-error provider fixtures under test/fixtures/auto-ria-ai/.
- [x] T002 [P] Create the declared gold-case registry, strata metadata, and manual parity-observation fields in test/fixtures/valuation-gold-cases.json.
- [x] T003 [P] Document disabled-by-default AI provider configuration keys and secret-handling guidance in .env.example.
- [ ] T004 Update specs/015-defensible-valuation-evidence/research.md with fixture schema/retention confirmation after approved provider-access review; do not enable production traffic.

---

## Phase 2: Foundational contracts, persistence, and budget gates

**Purpose**: Build the shared foundations that block all user stories.

**Critical**: No provider call, poll wiring, or Telegram surface may be implemented before this phase
is complete.

- [x] T005 [P] Define typed provider request/outcome, target, query mode, source-fact, and terminal-status contracts in src/modules/sources/ports/valuation-provider.port.ts.
- [x] T006 [P] Extend source ListingDetail facts and official AUTO.RIA info mapping for generation/modification/body/fuel/gearbox/drive IDs/names in src/modules/sources/ports/listing-source.port.ts and src/modules/sources/auto-ria/auto-ria.source.ts without changing legacy score inputs.
- [x] T007 [P] Write source-fact mapping regression tests in test/contract/auto-ria.spec.ts for present and unavailable provider-compatible fields.
- [x] T008 [P] Create immutable policy types, ai-shadow-v1 rules, deterministic sample selection, and query-mode prevalidation tests in src/modules/valuation/valuation-policy.ts and test/unit/valuation-policy.spec.ts.
- [x] T009 [P] Create pure input completeness, relaxation, comparability, redaction, and fingerprint helpers plus tests in src/modules/valuation/comparability.ts, src/modules/valuation/valuation-evidence.types.ts, test/unit/comparability.spec.ts, and test/unit/valuation-evidence.spec.ts.
- [x] T010 Create ValuationPolicyVersion and ValuationEvidence entities with named indexes/constraints, plus nullable Listing/Opportunity evidence-pointer fields, in src/modules/valuation/entities/valuation-policy-version.entity.ts, src/modules/valuation/entities/valuation-evidence.entity.ts, src/modules/listings/entities/listing.entity.ts, and src/modules/valuation/entities/opportunity.entity.ts.
- [x] T011 Create OperationBudgetState and extend immutable provider-budget activity fields/operation in src/modules/scheduling/entities/operation-budget-state.entity.ts and src/modules/scheduling/entities/budget-activity.entity.ts.
- [x] T012 Wire new entities and provider token through src/common/database/data-source.ts, src/modules/valuation/valuation.module.ts, src/modules/sources/sources.module.ts, and src/modules/scheduling/scheduling.module.ts.
- [x] T013 Generate and inspect the additive, symmetric TypeORM migration in src/common/database/migrations/ for evidence, policy, operation allocation, Listing pointer, Opportunity pointer, and budget activity additions.
- [x] T014 Add migration/entity-registry coverage and no-churn verification instructions in test/unit/valuation-evidence.spec.ts and specs/015-defensible-valuation-evidence/quickstart.md.
- [x] T015 Extend atomic source admission with valuation_ai operation allocation while preserving legacy pool behavior in src/modules/scheduling/rate-budget.service.ts and test/unit/rate-budget.spec.ts.
- [x] T016 Add typed AI provider enablement, user ID, policy key, sample rate, monthly allocation, timeout, and validation defaults in src/common/config/configuration.ts and .env.example.

**Checkpoint**: Additive schema, typed contracts, default-off configuration, and both source/global budget
gates are in place. Existing legacy tests remain green.

---

## Phase 3: User Story 1 - Inspect a provider-backed active-market estimate (Priority: P1)

**Goal**: Collect a clearly-labelled provider active-market estimate in shadow without modifying the
legacy score or alert flow.

**Independent Test**: A valid omni-ID fixture produces one immutable available evidence record with
provider estimate, facts, source time, policy/adapter versions, comparable projection, and legacy
delta. The existing legacy evaluation/notification assertions are identical with shadow disabled or
enabled.

### Tests for User Story 1

- [x] T017 [P] [US1] Add AI request/response contract tests for valid omni-ID and valid attributes mode in test/contract/auto-ria-ai-valuation.spec.ts.
- [x] T018 [P] [US1] Add source-adapter redaction, canonical request, provider-estimate, currency, and comparable-summary tests in test/contract/auto-ria-ai-valuation.spec.ts.
- [x] T019 [P] [US1] Add ValuationEvidenceService persistence/link/dedup service tests with fake repositories in test/unit/valuation-evidence.service.spec.ts.
- [x] T020 [P] [US1] Add poll regression tests that snapshot existing fair-value/score/opportunity/notification outputs in test/unit/poll.service.spec.ts.

### Implementation for User Story 1

- [x] T021 [US1] Implement the official POST provider adapter, bounded timeout, and typed result normalization in src/modules/sources/auto-ria/auto-ria-ai-valuation.provider.ts.
- [x] T022 [US1] Register the provider adapter and VALUATION_PROVIDER token in src/modules/sources/sources.module.ts and src/modules/sources/ports/valuation-provider.port.ts.
- [x] T023 [US1] Implement immutable available-evidence persistence, permitted comparable projection, legacy reference delta, and latest-pointer updates in src/modules/valuation/valuation-evidence.service.ts.
- [x] T024 [US1] Link Listing and Opportunity evidence-pointer projections after terminal persistence in src/modules/valuation/valuation-evidence.service.ts and src/modules/listings/listings.service.ts.
- [x] T025 [US1] Extend evaluation explanation schema V2 while preserving V1 compatibility in src/modules/valuation/evaluation-explanation.ts.
- [x] T026 [US1] Launch deterministic, error-observed shadow selection only after completed legacy poll evaluation in src/modules/polling/poll.service.ts without delaying or changing score/Opportunity/notification decisions.
- [x] T027 [US1] Invoke an explicitly selected manual provider lookup after legacy assessment in src/modules/query/query.service.ts without changing Assessment score fields.
- [x] T028 [US1] Record provider selection/admission/outcome/charge state as valuation_ai BudgetActivity in src/modules/scheduling/rate-budget.service.ts and src/modules/valuation/valuation-evidence.service.ts.
- [x] T029 [US1] Run the US1 contract, service, and poll regression tests named in test/contract/auto-ria-ai-valuation.spec.ts, test/unit/valuation-evidence.service.spec.ts, and test/unit/poll.service.spec.ts.

**Checkpoint**: A provider estimate can exist as a separate stored shadow record. A legacy alert's
score, rank, eligibility, and timing have not changed.

---

## Phase 4: User Story 2 - Fail closed when comparison is weak (Priority: P1)

**Goal**: Prevent a broad, incomplete, stale, or failed provider result from appearing as confident
evidence or triggering a hidden fallback.

**Independent Test**: Missing mileage in attributes mode causes zero provider request and a durable
invalid-input/review record. Each upstream failure maps to a distinct terminal state, no case calls
the legacy average endpoint, and an eligible result cannot contain a material relaxation.

### Tests for User Story 2

- [x] T030 [P] [US2] Add table-driven query-mode/missing-mileage/material-relaxation/eligibility tests in test/unit/valuation-policy.spec.ts and test/unit/comparability.spec.ts.
- [x] T031 [P] [US2] Add provider failure-mapping and no-legacy-fallback contract tests for 401/403/429/timeout/5xx/no-data/schema-invalid cases in test/contract/auto-ria-ai-valuation.spec.ts.
- [x] T032 [P] [US2] Add atomic operation-allocation denial, retry, cooldown, and charge-unknown ledger tests in test/unit/rate-budget.spec.ts.
- [x] T033 [P] [US2] Add single-flight/freshness/idempotent-terminal-evidence tests in test/unit/valuation-evidence.service.spec.ts.

### Implementation for User Story 2

- [x] T034 [US2] Implement policy-required attribute validation, input-completeness reason codes, and fail-closed comparability assessment in src/modules/valuation/valuation-policy.ts and src/modules/valuation/comparability.ts.
- [x] T035 [US2] Implement exact upstream failure classification, bounded retry admission, no-data/schema rejection, and no-fallback behavior in src/modules/sources/auto-ria/auto-ria-ai-valuation.provider.ts.
- [x] T036 [US2] Implement single-flight request fingerprinting, freshness reuse, immutable terminal attempt creation, and retry linkage in src/modules/valuation/valuation-evidence.service.ts.
- [x] T037 [US2] Enforce per-operation monthly allocation and provider-specific observability without changing legacy operation admission in src/modules/scheduling/rate-budget.service.ts and src/modules/scheduling/entities/operation-budget-state.entity.ts.
- [x] T038 [US2] Render missing/relaxed/stale facts, query mode, terminal reason, and provider-to-legacy delta from stored evidence in src/modules/notifications/format/why-message.ts.
- [x] T039 [US2] Run the full failure matrix and verify no test sends AUTO.RIA legacy average-price traffic after a provider failure in test/contract/auto-ria-ai-valuation.spec.ts.

**Checkpoint**: Weak/failed results are explicit evidence states, not numeric fallbacks or score
changes.

---

## Phase 5: User Story 3 - Reproduce and audit historical evidence (Priority: P2)

**Goal**: Make historical provider evidence readable without source traffic and expose shadow
coverage/quality/cost for a future approval decision.

**Independent Test**: With the provider disabled after evidence exists, /why renders the stored V2
block without network access. An admin audit over seeded records reports every required stratum,
quality/failure state, allocation result, and >=20% provider-to-legacy difference.

### Tests for User Story 3

- [x] T040 [P] [US3] Add V1/V2 stored-explanation rendering, Ukrainian provider label, redaction, and no-source-call tests in test/unit/why-message.spec.ts and test/unit/query-service.spec.ts.
- [x] T041 [P] [US3] Add pure audit aggregation tests for selection coverage, strata, status, failure, lookup mode, cost, and 20% delta buckets in test/unit/valuation-audit.spec.ts.
- [x] T042 [P] [US3] Add Telegram admin authorization and no-provider-call tests for /valuation_audit in test/unit/telegram-bot.update.spec.ts.

### Implementation for User Story 3

- [x] T043 [US3] Load stored latest/provider-linked evidence without refetching in src/modules/query/query.service.ts and src/modules/listings/listings.service.ts.
- [x] T044 [US3] Complete V1/V2 /why formatting and explicit active-market-not-sale wording in src/modules/notifications/format/why-message.ts.
- [x] T045 [US3] Implement the pure read-only audit digest/formatter over evidence, budget activity, and gold-case strata in src/modules/valuation/valuation-audit.ts and src/modules/notifications/format/valuation-audit-message.ts.
- [x] T046 [US3] Expose admin-only /valuation_audit and help text in src/modules/notifications/telegram/telegram-bot.update.ts, preserving all existing command behavior.
- [x] T047 [US3] Add read-only audit queries and gold-case registry loading in src/modules/query/query.service.ts and src/modules/valuation/valuation-evidence.service.ts.
- [ ] T048 [US3] Execute the seeded audit workflow in specs/015-defensible-valuation-evidence/quickstart.md and classify all review/unavailable/deferred/>=20% cases in its recorded release evidence.

**Checkpoint**: Historical evidence is reproducible, operator-readable, source-free, and auditable.
No audit command changes a policy, score, or alert.

---

## Phase 6: Polish, governance, and validation

**Purpose**: Validate the shadow-only boundary and synchronize durable documentation.

- [x] T049 [P] Update the feature status and index entry in knowledge-offers-analyzer/specs/README.md.
- [x] T050 [P] Add target-labelled valuation evidence terminology and preserve the existing fair-value definition in knowledge-offers-analyzer/domain/glossary.md.
- [x] T051 [P] Add a proposed shadow-only valuation-evidence decision record in knowledge-offers-analyzer/decisions/0017-shadow-valuation-evidence.md and index it in knowledge-offers-analyzer/decisions/README.md.
- [x] T052 [P] Update the AUTO.RIA source research/roadmap references in knowledge-offers-analyzer/research/alternative-sources.md and knowledge-offers-analyzer/Roadmap & Status.md.
- [x] T053 Record the implementation decision, evidence-source references, and no-live-change boundary in knowledge-offers-analyzer/context/log/2026-08-02-defensible-valuation-spec.md.
- [ ] T054 Run migration generation/apply/re-generation verification using src/common/database/migrations/ and record any no-churn result in specs/015-defensible-valuation-evidence/quickstart.md.
- [x] T055 Run npm run typecheck, npm run lint, npm test, npm run test:contract, npm run vault:build, and npm run vault:check:strict from package.json.
- [ ] T056 Review the resulting audit with the operator before any separate activation specification; leave AUTO_RIA_AI_ENABLED disabled unless explicitly authorized.

## Dependencies and Execution Order

- Phase 1 has no code dependency and prepares the legal/contract evidence.
- Phase 2 blocks all user stories because it provides typed data, persistence, default-off configuration,
  and budget safety.
- US1 starts after Phase 2 and delivers the shadow provider record.
- US2 depends on the US1 provider/evidence path because it hardens the same request lifecycle.
- US3 depends on stored evidence from US1 and terminal states from US2.
- Phase 6 occurs after all desired user stories. Documentation tasks can be prepared in parallel but
  should be finalized only after implementation decisions are stable.

## Parallel Opportunities

- T005-T009 can proceed in parallel after fixture work because they change distinct contracts/pure
  modules.
- T017-T020 can proceed in parallel after foundational types/entities exist.
- T030-T033 can proceed in parallel after the US1 service shape is stable.
- T040-T042 can proceed in parallel after terminal evidence schema is stable.
- T049-T052 can proceed in parallel after the plan is accepted; T053 follows their final decisions.

## Parallel Example: User Story 1

    Task: T017 contract test in test/contract/auto-ria-ai-valuation.spec.ts
    Task: T019 service test in test/unit/valuation-evidence.service.spec.ts
    Task: T020 legacy poll regression test in test/unit/poll.service.spec.ts

After those tests fail for the intended behavior:

    Task: T021 provider adapter in src/modules/sources/auto-ria/auto-ria-ai-valuation.provider.ts
    Task: T023 evidence service in src/modules/valuation/valuation-evidence.service.ts
    Task: T025 explanation V2 in src/modules/valuation/evaluation-explanation.ts

## Implementation Strategy

### MVP first

1. Complete Phase 1 and Phase 2.
2. Complete US1 only.
3. Prove an enabled fixture/provider produces evidence while the legacy score/alert output is
   unchanged.
4. Keep the feature disabled in production until US2 failure handling and US3 audit are complete.

### Incremental delivery

1. Foundation plus US1: auditable shadow capture.
2. US2: conservative failure/weak-comparability behavior.
3. US3: source-free explanation and release audit.
4. Polish: documentation, migration no-churn, full validation, and operator review.

### Explicit non-goal

No task in this file changes live valuation policy. Activation must be planned and approved separately
after source-parity, budget, coverage, and actual-outcome evidence exists.
