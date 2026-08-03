import { Money } from '../../../common/types/money';

/** DI token for the external, target-labelled valuation provider (SPEC-015). */
export const VALUATION_PROVIDER = Symbol('VALUATION_PROVIDER');

export const AUTO_RIA_AI_PROVIDER_KEY = 'auto-ria-ai';
export const ACTIVE_LISTING_ASK_TARGET = 'active_listing_ask';

export type ValuationProviderKey = typeof AUTO_RIA_AI_PROVIDER_KEY;
export type ValuationTarget = typeof ACTIVE_LISTING_ASK_TARGET;
export type ValuationQueryMode = 'omni_id' | 'attributes';
export type ProviderValuationStatus =
  'available' | 'unavailable' | 'deferred' | 'invalid_input' | 'not_configured';
export type ProviderFailureCode =
  | 'not_configured'
  | 'invalid_input'
  | 'budget_denied'
  | 'auth_failed'
  | 'permission_denied'
  | 'not_found'
  | 'insufficient_data'
  | 'source_rate_limited'
  | 'timeout'
  | 'transport'
  | 'source_4xx'
  | 'source_5xx'
  | 'schema_invalid';
export type ProviderChargeStatus = 'charged' | 'not_charged' | 'unknown' | 'not_applicable';
export type ProviderFactProvenance = 'source_payload' | 'local_derivation' | 'not_provided';

/**
 * Every provider-compatible fact is explicit about whether the source supplied it. `unavailable`
 * is deliberately different from a false/zero value, which may be a valid source observation.
 */
export type ProviderFact<T> =
  | {
      availability: 'available';
      provenance: Exclude<ProviderFactProvenance, 'not_provided'>;
      value: T;
    }
  | { availability: 'unavailable'; provenance: 'not_provided'; value: null };

export interface ProviderLocation {
  stateId?: number;
  cityId?: number;
  stateName?: string;
  cityName?: string;
}

/** VIN evidence state only; raw VIN and plate values are never part of this provider port. */
export interface ProviderVinEvidence {
  hasVinReport: boolean;
  vinChecked: boolean;
}

/**
 * Local condition classifications may be attached by valuation policy. The source adapter never
 * copies free-text seller descriptions into this structure or the provider request.
 */
export interface ProviderConditionEvidence {
  signalCodes: string[];
}

/**
 * Source facts retained for a provider valuation attempt. IDs and display names are both kept so
 * a future adapter/policy can state exactly which AUTO.RIA dimension was available without
 * guessing an equivalent value.
 */
export interface ProviderVehicleFacts {
  /** Optional only for compatibility with old snapshots; attributes mode rejects its absence. */
  categoryId?: ProviderFact<number>;
  make: ProviderFact<string>;
  model: ProviderFact<string>;
  markId: ProviderFact<number>;
  modelId: ProviderFact<number>;
  year: ProviderFact<number>;
  generationId: ProviderFact<number>;
  generationName: ProviderFact<string>;
  modificationId: ProviderFact<number>;
  modificationName: ProviderFact<string>;
  bodyId: ProviderFact<number>;
  bodyName: ProviderFact<string>;
  fuelId: ProviderFact<number>;
  fuelName: ProviderFact<string>;
  gearboxId: ProviderFact<number>;
  gearboxName: ProviderFact<string>;
  driveId: ProviderFact<number>;
  driveName: ProviderFact<string>;
  /** AUTO.RIA raceInt unit: thousand kilometres. */
  mileageK: ProviderFact<number>;
  location: ProviderFact<ProviderLocation>;
  vinEvidence: ProviderFact<ProviderVinEvidence>;
  conditionEvidence: ProviderFact<ProviderConditionEvidence>;
}

export type ValuationTrigger = 'poll_shadow' | 'manual_check' | 'audit_case';
export type ValuationSelectionReason = 'manual' | 'deterministic_sample' | 'gold_case';

export interface ProviderValuationRequestContext {
  trigger: ValuationTrigger;
  selectionReason: ValuationSelectionReason;
  profileId?: string;
}

/**
 * Caller-owned, redacted canonical input. Source admission, policy checks, persistence, and
 * single-flight ownership stay outside this port; this adapter only maps one admitted request.
 */
export interface ProviderValuationRequest {
  providerKey: ValuationProviderKey;
  target: ValuationTarget;
  policyKey: string;
  adapterVersion: string;
  /** AUTO.RIA AI period in hours/days as defined by its provider contract. */
  period: number;
  /** AUTO.RIA language identifier (`langId`), not a free-text locale. */
  languageId: number;
  queryMode: ValuationQueryMode;
  sourceListingId?: string;
  normalizedFacts: ProviderVehicleFacts;
  requestFingerprint: string;
  context: ProviderValuationRequestContext;
}

export interface ProviderMarketEstimate extends Money {}

/** Only provider-declared values are retained; absent range/count is not synthesized. */
export interface ProviderStatistics {
  comparableCount?: number;
  minimum?: ProviderMarketEstimate;
  maximum?: ProviderMarketEstimate;
  values?: ProviderStatisticProjection[];
}

/** Allow-listed provider statistic block; never a raw provider response fragment. */
export interface ProviderStatisticProjection {
  id?: string;
  name?: string;
  type?: string;
  price: ProviderMarketEstimate;
}

/** A bounded, allow-listed projection of a provider comparable. */
export interface ProviderComparableProjection {
  sourceListingId?: string;
  make?: string;
  model?: string;
  year?: number;
  mileageK?: number;
  price?: ProviderMarketEstimate;
}

export interface ProviderComparableSummary {
  returnedCount: number;
  retainedCount: number;
  truncated: boolean;
  comparables: ProviderComparableProjection[];
}

/** Safe-to-persist projection: no API key, user ID, URL, VIN, plate, seller, or raw payload. */
export interface ProviderRequestProjection {
  endpointPath: string;
  method: 'POST';
  queryMode: ValuationQueryMode;
  body: Record<string, unknown>;
}

export interface ProviderMetadata {
  adapterVersion: string;
  queryMode: ValuationQueryMode;
  correlationId?: string;
}

export interface ProviderValuationOutcome {
  providerKey: ValuationProviderKey;
  target: ValuationTarget;
  adapterVersion: string;
  queryMode: ValuationQueryMode;
  status: ProviderValuationStatus;
  failureCode?: ProviderFailureCode;
  retryable: boolean;
  chargeStatus: ProviderChargeStatus;
  requestProjection: ProviderRequestProjection;
  /** Provider-reported as-of time when available; otherwise adapter local response-capture time. */
  sourceCapturedAt?: Date;
  estimate?: ProviderMarketEstimate;
  statistics?: ProviderStatistics;
  comparableSummary?: ProviderComparableSummary;
  responseFingerprint?: string;
  providerMetadata: ProviderMetadata;
}

/** A source adapter for one external active-market valuation provider. */
export interface ValuationProvider {
  readonly key: ValuationProviderKey;
  readonly adapterVersion: string;
  valuate(request: ProviderValuationRequest): Promise<ProviderValuationOutcome>;
}

export function unavailableProviderFact<T>(): ProviderFact<T> {
  return { availability: 'unavailable', provenance: 'not_provided', value: null };
}

export function sourceProviderFact<T>(value: T): ProviderFact<T> {
  return { availability: 'available', provenance: 'source_payload', value };
}
