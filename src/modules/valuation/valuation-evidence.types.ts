import { Currency } from '../../common/types/money';
import {
  ACTIVE_LISTING_ASK_TARGET as SOURCE_ACTIVE_LISTING_ASK_TARGET,
  ProviderChargeStatus,
  ProviderFactProvenance,
  ProviderValuationOutcome,
  ProviderValuationStatus,
  ValuationQueryMode as ProviderValuationQueryMode,
  ValuationSelectionReason as ProviderValuationSelectionReason,
  ValuationTarget,
  ValuationTrigger,
} from '../sources/ports/valuation-provider.port';

/** The only valuation target admitted by SPEC-015. It is not a resale-price claim. */
export const ACTIVE_LISTING_ASK_TARGET = SOURCE_ACTIVE_LISTING_ASK_TARGET;

export type ValuationEvidenceTarget = ValuationTarget;
export type ValuationQueryMode = ProviderValuationQueryMode;
export type ValuationEvidenceStatus = ProviderValuationStatus;
export type ValuationComparability = 'eligible' | 'review' | 'not_assessed';
export type ValuationEvidenceTrigger = ValuationTrigger;
export type ValuationSelectionReason = ProviderValuationSelectionReason;
export type ValuationChargeStatus = ProviderChargeStatus;
export type ValuationPolicyStatus = 'shadow' | 'retired';

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

/** Whether a captured fact came from the source, was absent, or cannot be asserted. */
export type ValuationFactAvailability = 'available' | 'unavailable';
export type ValuationFactProvenance = ProviderFactProvenance;

/**
 * A redaction-safe, explicit source fact.  This is deliberately more expressive than a plain
 * `undefined`: old evidence must show whether a field was absent or simply unknown.
 */
export interface ValuationFact {
  value?: JsonValue;
  availability: ValuationFactAvailability;
  provenance: ValuationFactProvenance;
}

export type ValuationFactSnapshot = Record<string, ValuationFact>;

export interface ValuationPolicyRules {
  target: ValuationEvidenceTarget;
  /** Facts which an attribute query must possess without invention. */
  requiredFacts: readonly string[];
  /** The stricter attribute-mode requirements (including actual mileage). */
  attributeRequiredFacts: readonly string[];
  query: {
    preferredMode: 'omni_id';
    attributesRequireActualMileage: true;
  };
  /**
   * Dimensions that materially affect comparability. A dimension is present when at least one
   * of its source facts is available; absence is retained as an explicit review reason.
   */
  materialDimensions: readonly ValuationMaterialDimension[];
  /** Minimum retained provider comparables needed before an estimate can be eligible. */
  minimumComparableCount: number;
  /** Dimensions that may be omitted only with an explicit review reason. */
  allowedRelaxations: readonly string[];
  /** A stored available result becomes stale after this many hours. */
  freshnessHours: number;
  sampling: {
    algorithm: 'sha256-mod-10000';
    defaultRate: number;
  };
  /** Absolute provider-to-legacy deltas that must be placed into review. */
  discrepancyBucketsPct: readonly number[];
}

export interface ValuationMaterialDimension {
  code: string;
  facts: readonly string[];
}

export interface ValuationPolicyDefinition {
  key: string;
  target: ValuationEvidenceTarget;
  status: ValuationPolicyStatus;
  rules: ValuationPolicyRules;
}

/** Captured alongside each evidence record so later policy changes cannot rewrite its meaning. */
export interface ValuationPolicySnapshot extends ValuationPolicyDefinition {
  digest: string;
}

export interface ValuationInputCompleteness {
  requiredFacts: string[];
  availableFacts: string[];
  missingFacts: string[];
  missingMaterialDimensions: string[];
  relaxedFacts: string[];
}

export interface ValuationComparabilityAssessment {
  comparability: ValuationComparability;
  reasons: string[];
  inputCompleteness: ValuationInputCompleteness;
}

/** A bounded projection of the legacy benchmark observed beside provider evidence. */
export interface LegacyValuationReference {
  baseAmount?: number;
  adjustedAmount?: number;
  currency?: Currency | string;
  sampleSize?: number;
  cohortKey?: string;
  parameterSetVersion?: number;
  providerDeltaAmount?: number;
  providerDeltaPct?: number;
}

/** The source port owns HTTP; valuation code only persists this already-normalized outcome. */
export type ValuationProviderEvidenceOutcome = ProviderValuationOutcome;

/** Terminal state supplied without invoking a provider (disabled, invalid input, or deferred). */
export interface ValuationEvidenceTerminalOutcome {
  /** Local terminal failures have no provider payload; only `available` requires one. */
  status: Exclude<ValuationEvidenceStatus, 'available'>;
  failureCode?: string;
  chargeStatus?: ValuationChargeStatus;
}

export type ValuationEvidenceOutcome =
  | ValuationProviderEvidenceOutcome
  | ValuationEvidenceTerminalOutcome;
