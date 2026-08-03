# Data Model: Defensible valuation evidence

## New entity: ValuationPolicyVersion

Immutable, code-seeded policy definition. It is distinct from the existing scoring ParameterSet.

| Field | Type | Rule |
|---|---|---|
| id | UUID | Primary key |
| key | varchar, unique | Example: ai-shadow-v1 |
| target | varchar | Must be active_listing_ask for this feature |
| status | varchar | shadow, retired; never live-scoring here |
| rules | JSONB | Required facts, query rules, relaxations, freshness, sampling, discrepancy buckets |
| createdAt | timestamptz | Immutable creation time |

Rows are never updated. A change creates a new policy version. Evidence stores both key and a
policy snapshot/digest so an old result remains interpretable even if code changes.

## New entity: ValuationEvidence

A terminal valuation-attempt/evidence record. It is append-only after terminal persistence.

| Field | Type | Rule |
|---|---|---|
| id | UUID | Primary key |
| listingId | UUID | Required local listing reference |
| profileId | UUID, nullable | Source profile when poll-triggered |
| opportunityId | UUID, nullable | Optional precise surrounding legacy opportunity link |
| providerKey | varchar | Initial value auto-ria-ai |
| target | varchar | active_listing_ask |
| trigger | varchar | poll_shadow, manual_check, audit_case |
| selectionReason | varchar | manual, deterministic_sample, gold_case |
| policyKey | varchar | Immutable policy identity |
| adapterVersion | varchar | Provider contract/mapping version |
| queryMode | varchar | omni_id or attributes |
| requestFingerprint | varchar | Canonical redacted facts plus provider/policy/period/freshness |
| inputSnapshot | JSONB | Normalized local facts plus per-field availability/provenance |
| requestProjection | JSONB | Permitted source request projection; never credential-bearing |
| status | varchar | not_configured, invalid_input, deferred, unavailable, available |
| failureCode | varchar, nullable | Specific terminal reason such as budget_denied, auth_failed, schema_invalid |
| comparability | varchar | eligible, review, not_assessed |
| comparabilityReasons | JSONB | Missing/relaxed/stale/quality reasons |
| estimateAmount | numeric, nullable | Provider-declared central estimate only |
| currency | varchar, nullable | Required when estimate exists |
| providerStatistics | JSONB, nullable | Permitted normalized statistics/range/comparable count |
| comparableSummary | JSONB, nullable | Permitted normalized similarCars projection, bounded size |
| legacyReference | JSONB, nullable | Legacy base/adjusted values, cohort, and delta at observation time |
| sourceCapturedAt | timestamptz, nullable | Provider as-of time when supplied; otherwise explicitly labelled adapter local response-capture time |
| expiresAt | timestamptz, nullable | Policy freshness marker |
| responseFingerprint | varchar, nullable | Digest of permitted normalized response |
| chargeStatus | varchar | charged, not_charged, unknown, not_applicable |
| createdAt | timestamptz | Attempt/evidence record time |

Indexes: listingId plus createdAt descending; requestFingerprint plus policyKey plus createdAt;
status plus createdAt; profileId plus createdAt. Use named indexes/constraints in entity and
migration. Do not add a destructive unique constraint that prevents historical attempts.

## New entity: OperationBudgetState

A durable, atomic operation allocation alongside the existing source-level monthly pool.

| Field | Type | Rule |
|---|---|---|
| id | UUID | Primary key |
| sourceKey | varchar | auto-ria |
| monthKey | varchar | YYYYMM |
| operation | varchar | valuation_ai initially |
| capacity | integer | Configured effective provider allocation |
| used | integer | Atomically incremented only on admitted call |
| updatedAt | timestamptz | Last state mutation |

Unique key: sourceKey, monthKey, operation. It adds an operation cap but does not change the
existing pool math for legacy operations. Each admission still creates BudgetActivity.

## Existing-entity additions

| Entity | Addition | Purpose |
|---|---|---|
| Listing | lastValuationEvidenceId nullable UUID | Latest convenience pointer; history remains in ValuationEvidence. |
| Opportunity | valuationEvidenceId nullable UUID | Relates a notification candidate to exact surrounding provider evidence without changing score fields. |
| BudgetActivity | operation valuation_ai; requestFingerprint nullable; chargeStatus nullable | Makes provider consumption and reconciliation observable. |
| ListingDetail port | Structured provider-compatible vehicle facts | Carries generation/modification/body/fuel/gearbox/drive IDs/names and availability with no scoring change. |
| EvaluationExplanation | Schema V2 optional providerEvidence reference | V1 remains supported; V2 is a compatibility projection, not the evidence store. |

All additions are nullable/additive. Existing legacy explanation JSON, fair-value benchmarks,
average-price snapshots, and SPEC-004 cohort keys remain untouched.

## State model

    request considered
       |-- feature disabled -> not_configured / not_assessed
       |-- incomplete policy-required input -> invalid_input / review
       |-- budget or schedule defers -> deferred / not_assessed
       |-- provider returns valid estimate -> available / eligible-or-review
       |-- provider has no usable estimate or fails -> unavailable / not_assessed

Terminal records are immutable. A retry creates a new record linked by the same request fingerprint,
not a mutation of a prior terminal result. In-flight dedupe is managed by the service using the
canonical fingerprint and freshness window.

## Retention and privacy

- Keep only the provider-approved normalized request/response projection needed to reproduce an
  explanation and audit quality.
- Do not store API keys, bearer tokens, full raw request URLs, raw VIN/plate, seller contacts,
  free-text personal data, or unbounded comparable payloads.
- Store deterministic digests of canonical redacted projections for integrity and drift detection.
- Historical records never receive reconstructed fields; old/missing evidence is explicitly unknown.
