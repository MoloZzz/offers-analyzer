# Quickstart: Shadow valuation evidence

This guide validates the feature after implementation. It intentionally does not authorize a live
scoring change.

## 1. Prepare provider access

1. Obtain official AUTO.RIA AI valuation permission, user identifier, API credential, pricing,
   attribution, and retention approval.
2. Use a non-production credential to capture permitted fixture responses for valid listing-ID and
   attribute requests plus all documented failure classes.
3. Review the feature's redaction tests before any environment receives a credential.

## 2. Keep shadow disabled first

Set configuration to its safe defaults:

    AUTO_RIA_AI_ENABLED=false
    AUTO_RIA_AI_API_KEY=
    AUTO_RIA_AI_USER_ID=
    AUTO_RIA_AI_SAMPLE_RATE=0
    AUTO_RIA_AI_MONTHLY_ALLOCATION=0
    AUTO_RIA_AI_TIMEOUT_MS=5000
    AUTO_RIA_AI_POLICY_KEY=ai-shadow-v1

Do not put secrets in tracked files. Configuration validation must reject an enabled provider without
the required user identifier, credential, and positive integer allocation. A zero sample rate
prevents automatic poll-side collection; it does not disable an explicitly enabled manual `/check`.
A zero allocation blocks every paid provider request.

## 3. Verify locally

1. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run test:contract` (use `npm.cmd`
   on native Windows when required).
2. The additive migration `1785350000000-spec-015-valuation-evidence.ts` is supplied but is not
   applied by this implementation. On an operator-approved development database, run
   `npm run migration:run`, then generate/inspect a follow-up migration and verify no schema churn.
3. Perform a manual check with the provider disabled. Confirm a not-configured record is visible
   and the legacy score is unchanged.
4. Enable a test fixture/fake provider. Confirm one available evidence record contains target,
   explicitly-labelled provider-as-of or local response-capture time, query mode, facts,
   policy/adapter version, redacted response fingerprint, and
   eligibility/review decision.
5. Repeat the same request concurrently. Confirm one outbound provider call and shared evidence
   reference.
6. Request /why after disabling the provider. Confirm it renders stored provider evidence without
   a network request.

## 4. Start controlled shadow collection

1. Configure a small nonzero monthly feature allocation and deterministic sample rate only after
   reviewing current source-pool headroom.
2. Keep the provider low priority. Confirm every allowed/denied attempt appears as valuation_ai in
   the budget report.
3. The gold-case registry is `test/fixtures/valuation-gold-cases.json`. It includes the Audi
   incident and pending dealer/private, regional, and VIN-unverified strata. Capture the pending
   public-calculator diagnostics manually with timestamp and source; do not scrape them.
4. Use /valuation_audit to inspect coverage, failure classes, input completeness, provider-to-legacy
   deltas, provider/public parity, retry/cost state, allocation/reconciliation, and all
   review/unavailable/deferred cases. The initial audit explicitly says that latency/cache-reuse
   telemetry is not persisted yet; it never fabricates those metrics.

## 5. Stop conditions

Immediately set the feature allocation/sample to zero and investigate if:

- provider requests consume protected discovery capacity;
- contract/redaction/schema tests fail;
- provider API and manual public-calculator parity differ without an explanation;
- a terminal source failure is rendered as a numeric valuation;
- a shadow result changes a legacy score, ranking, alert, threshold, ParameterSet, factor, or k.

## 6. What completion means

Feature completion means the shadow evidence path is auditable and safe. It does not mean that the
provider estimate is a verified resale price or that it may influence alerts. A later activation
proposal must satisfy ADR-0011, source parity, budget reconciliation, and actual-outcome evidence.
