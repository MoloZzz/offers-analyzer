# Contract: AUTO.RIA AI valuation provider

## Purpose

This is the adapter boundary for the official paid AUTO.RIA AI valuation service. Pin exact field
names, HTTP schema, and permitted retention using recorded authorized fixtures before enabling it.
The local port does not expose source secrets or raw payloads to callers.

## Local request contract

    ProviderValuationRequest
      providerKey: auto-ria-ai
      target: active_listing_ask
      policyKey, adapterVersion, period, language
      queryMode: omni_id | attributes
      sourceListingId when omni_id
      normalizedFacts with availability/provenance
      requestFingerprint
      context: profile/trigger/selection

Rules:

- Prefer omni_id with the AUTO.RIA listing ID.
- Attributes mode requires the policy's hard fact set, including actual mileage. Missing mileage
  returns invalid_input before network admission.
- The canonical fingerprint includes only redacted normalized fields, query mode, period, provider,
  policy, adapter version, and a freshness bucket.
- Never include API key, bearer token, raw VIN/plate, contact data, or raw URL in the projection.

## Local result contract

    ProviderValuationOutcome
      status: available | unavailable | deferred | invalid_input | not_configured
      failureCode optional
      sourceCapturedAt optional
      estimate: providerMarketEstimate amount/currency optional
      statistics optional
      comparableSummary optional
      responseFingerprint optional
      chargeStatus
      retryable boolean
      providerMetadata: request mode, correlation ID when permitted, adapter version

A valid available result has a positive finite provider estimate and a known currency. The provider
estimate is retained verbatim as provider_market_estimate; never calculate an alternate central
value from partial similarCars data.

## HTTP/error mapping

| Upstream condition | Local status | Failure code | Retry |
|---|---|---|---|
| Feature disabled or credentials absent | not_configured | not_configured | No |
| Attribute facts invalid/incomplete | invalid_input | invalid_input | No |
| Budget/allocation denial | deferred | budget_denied | No |
| 401 | unavailable | auth_failed | No |
| 403 | unavailable | permission_denied | No |
| 404 or empty usable result | unavailable | not_found or insufficient_data | No |
| 429 | deferred | source_rate_limited | Bounded after common cooldown |
| Timeout/transport/5xx | unavailable | timeout, transport, or source_5xx | Bounded policy retry |
| Invalid/missing response field | unavailable | schema_invalid | No; alert for contract review |

Every retry returns through provider budget admission. The provider must never silently call the
legacy average-price adapter on any failure.

## Contract tests

Fixtures must cover listing-ID success, attribute success, no-data, 401, 403, 429, timeout, 5xx,
and malformed schema. Tests assert:

- POST path/method and allowed request body projection;
- no secrets in logs/evidence;
- exact response mapping and currency validation;
- terminal status/failure mapping;
- no legacy endpoint request after any AI outcome;
- canonical fingerprints/dedup behavior;
- response schema drift fails closed.

