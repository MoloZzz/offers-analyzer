import { createHash } from 'crypto';

import { ProviderVehicleFacts } from '../sources/ports/valuation-provider.port';

import {
  JsonObject,
  JsonValue,
  LegacyValuationReference,
  ValuationComparabilityAssessment,
  ValuationEvidenceStatus,
  ValuationFactSnapshot,
  ValuationInputCompleteness,
  ValuationMaterialDimension,
  ValuationPolicyDefinition,
} from './valuation-evidence.types';
import { AI_SHADOW_V1_POLICY, hasUsableFact, requiredFactsMissing } from './valuation-policy';

const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_ARRAY_LENGTH = 25;
const DEFAULT_MAX_OBJECT_KEYS = 50;

export interface InputCompletenessOptions {
  requiredFacts: readonly string[];
  materialDimensions?: readonly ValuationMaterialDimension[];
  relaxedFacts?: readonly string[];
}

/** Make missing and deliberately relaxed facts explicit before any provider call. */
export function assessInputCompleteness(
  facts: object,
  options: InputCompletenessOptions,
): ValuationInputCompleteness {
  const missingFacts = requiredFactsMissing(facts, options.requiredFacts);
  const availableFacts = options.requiredFacts.filter((name) => !missingFacts.includes(name));
  const missingMaterialDimensions = (options.materialDimensions ?? [])
    .filter((dimension) =>
      !dimension.facts.some((fact) => hasUsableFact(factFrom(facts, fact))),
    )
    .map((dimension) => dimension.code)
    .sort();
  const relaxedFacts = [...new Set(options.relaxedFacts ?? [])].sort();
  return {
    requiredFacts: [...options.requiredFacts],
    availableFacts,
    missingFacts,
    missingMaterialDimensions,
    relaxedFacts,
  };
}

export interface ComparabilityInput {
  status: ValuationEvidenceStatus;
  queryMode: 'omni_id' | 'attributes';
  facts: object;
  policy?: ValuationPolicyDefinition;
  /** Explicit policy relaxations actually used for this request, never inferred silently. */
  materialRelaxations?: readonly string[];
  sourceCapturedAt?: Date | null;
  providerStatisticsAvailable?: boolean;
  providerComparableSummaryAvailable?: boolean;
  providerReturnedComparableCount?: number | null;
  providerRetainedComparableCount?: number | null;
  legacyDeltaPct?: number | null;
  terminalReasons?: readonly string[];
  now?: Date;
}

/**
 * Fail closed for weak evidence.  A numeric estimate is eligible only when all required policy
 * facts are present, no material relaxation happened, and the persisted provider evidence is
 * fresh enough to explain its original context.
 */
export function assessComparability(input: ComparabilityInput): ValuationComparabilityAssessment {
  const policy = input.policy ?? AI_SHADOW_V1_POLICY;
  const requiredFacts =
    input.queryMode === 'attributes'
      ? [...new Set([...policy.rules.requiredFacts, ...policy.rules.attributeRequiredFacts])]
      : policy.rules.requiredFacts;
  const completeness = assessInputCompleteness(input.facts, {
    requiredFacts,
    materialDimensions: policy.rules.materialDimensions,
    relaxedFacts: input.materialRelaxations,
  });
  const reasons = [...(input.terminalReasons ?? [])];

  if (input.status !== 'available') {
    if (input.status === 'invalid_input') {
      reasons.push(...missingReasons(input.queryMode, completeness.missingFacts));
      for (const dimension of completeness.missingMaterialDimensions) {
        reasons.push(`material_dimension_missing:${dimension}`);
      }
      return {
        comparability: 'review',
        reasons: uniqueSorted(reasons),
        inputCompleteness: completeness,
      };
    }
    if (reasons.length === 0) reasons.push(`terminal_status:${input.status}`);
    return {
      comparability: 'not_assessed',
      reasons: uniqueSorted(reasons),
      inputCompleteness: completeness,
    };
  }

  reasons.push(...missingReasons(input.queryMode, completeness.missingFacts));
  for (const dimension of completeness.missingMaterialDimensions) {
    reasons.push(`material_dimension_missing:${dimension}`);
  }
  for (const dimension of completeness.relaxedFacts) {
    reasons.push(`material_relaxation:${dimension}`);
  }

  if (input.queryMode === 'attributes' && !hasUsableFact(factFrom(input.facts, 'mileageK'))) {
    reasons.push('attributes_mileage_required');
  }

  if (!input.sourceCapturedAt) {
    reasons.push('source_capture_time_missing');
  } else if (!isEvidenceFresh(input.sourceCapturedAt, policy.rules.freshnessHours, input.now)) {
    reasons.push('source_evidence_stale');
  }

  if (input.providerStatisticsAvailable !== true) reasons.push('provider_statistics_unavailable');
  appendComparableEvidenceReasons(input, policy, reasons);
  if (isMaterialLegacyDelta(input.legacyDeltaPct, policy)) reasons.push('legacy_delta_at_least_20_pct');

  return {
    comparability: reasons.length === 0 ? 'eligible' : 'review',
    reasons: uniqueSorted(reasons),
    inputCompleteness: completeness,
  };
}

/** An available record must carry exactly a positive finite estimate and a currency. */
export function validateAvailableEstimate(estimate: {
  amount: number;
  currency: string;
} | undefined): string[] {
  if (!estimate) return ['provider_estimate_missing'];
  if (!Number.isFinite(estimate.amount) || estimate.amount <= 0) return ['provider_estimate_invalid'];
  if (!estimate.currency.trim()) return ['provider_currency_missing'];
  return [];
}

export interface LegacyDeltaAssessment {
  delta: { amount: number; pct: number } | null;
  /** A non-comparable currency must stay visible rather than being silently subtracted. */
  reason?: 'legacy_currency_missing' | 'legacy_currency_mismatch';
}

/**
 * Compare provider and legacy amounts only in the same currency.  Converting here would hide an
 * FX assumption in a shadow-evidence record, so callers must supply a separately normalized
 * legacy reference if they need a cross-currency comparison.
 */
export function assessLegacyDelta(
  providerEstimate: { amount: number; currency: string } | null | undefined,
  reference: LegacyValuationReference | null | undefined,
): LegacyDeltaAssessment {
  if (!providerEstimate || !reference) return { delta: null };
  if (!Number.isFinite(providerEstimate.amount) || providerEstimate.amount <= 0) return { delta: null };
  const legacyAmount = reference.adjustedAmount ?? reference.baseAmount;
  if (typeof legacyAmount !== 'number' || !Number.isFinite(legacyAmount) || legacyAmount <= 0) {
    return { delta: null };
  }
  const providerCurrency = normalizedCurrency(providerEstimate.currency);
  const legacyCurrency = normalizedCurrency(reference.currency);
  if (!providerCurrency || !legacyCurrency) return { delta: null, reason: 'legacy_currency_missing' };
  if (providerCurrency !== legacyCurrency) return { delta: null, reason: 'legacy_currency_mismatch' };

  const amount = providerEstimate.amount - legacyAmount;
  return { delta: { amount, pct: (amount / legacyAmount) * 100 } };
}

/** Returns null rather than manufacturing a legacy comparison when either side is invalid or differs in currency. */
export function calculateLegacyDelta(
  providerEstimate: { amount: number; currency: string } | null | undefined,
  reference: LegacyValuationReference | null | undefined,
): { amount: number; pct: number } | null {
  return assessLegacyDelta(providerEstimate, reference).delta;
}

/** Stored evidence only remains reusable while the policy's freshness window is open. */
export function isEvidenceFresh(
  capturedAt: Date,
  freshnessHours: number,
  now = new Date(),
): boolean {
  if (!Number.isFinite(capturedAt.getTime()) || !Number.isFinite(freshnessHours) || freshnessHours < 0) {
    return false;
  }
  return capturedAt.getTime() + freshnessHours * 60 * 60 * 1000 >= now.getTime();
}

/** Create an immutable, redacted source-fact projection from the provider's typed facts. */
export function snapshotProviderFacts(facts: ProviderVehicleFacts): ValuationFactSnapshot {
  const snapshot: ValuationFactSnapshot = {};
  for (const name of Object.keys(facts) as Array<keyof ProviderVehicleFacts>) {
    const rawFact = facts[name];
    if (!rawFact) {
      snapshot[name] = { availability: 'unavailable', provenance: 'not_provided', value: null };
      continue;
    }
    snapshot[name] = {
      availability: rawFact.availability,
      provenance: rawFact.provenance,
      value: redactValuationProjection(rawFact.value),
    };
  }
  return snapshot;
}

/**
 * Remove data we are not allowed to retain (credentials, raw VIN/plate, contacts, free text,
 * raw URLs/payloads) and bound a JSON projection before it reaches a JSONB evidence column.
 */
export function redactValuationProjection(
  value: unknown,
  options: {
    maxDepth?: number;
    maxArrayLength?: number;
    maxObjectKeys?: number;
  } = {},
): JsonValue {
  const seen = new WeakSet<object>();
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxArrayLength = options.maxArrayLength ?? DEFAULT_MAX_ARRAY_LENGTH;
  const maxObjectKeys = options.maxObjectKeys ?? DEFAULT_MAX_OBJECT_KEYS;

  const visit = (current: unknown, depth: number): JsonValue => {
    if (current === null) return null;
    if (typeof current === 'string' || typeof current === 'boolean') return current;
    if (typeof current === 'number') return Number.isFinite(current) ? current : null;
    if (current instanceof Date) return Number.isFinite(current.getTime()) ? current.toISOString() : null;
    if (depth >= maxDepth) return '[truncated]';
    if (Array.isArray(current)) return current.slice(0, maxArrayLength).map((item) => visit(item, depth + 1));
    if (typeof current !== 'object') return String(current);
    if (seen.has(current)) return '[circular]';
    seen.add(current);

    const result: JsonObject = {};
    const entries = Object.entries(current as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, maxObjectKeys);
    for (const [key, nested] of entries) {
      result[key] = isSensitiveField(key) ? '[redacted]' : visit(nested, depth + 1);
    }
    if (Object.keys(current).length > maxObjectKeys) result.__truncated = true;
    return result;
  };

  return visit(value, 0);
}

/** Deterministic SHA-256 identity for redacted, canonical request/response projections. */
export function fingerprintValuationProjection(value: unknown): string {
  return createHash('sha256').update(canonicalJson(redactValuationProjection(value))).digest('hex');
}

/** Stable canonical JSON is exported for tests and compatible downstream request construction. */
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

/** Ukrainian labels are kept with stable machine codes so stored explanations remain explainable. */
export function valuationReasonLabel(code: string): string {
  if (code.startsWith('missing_required_fact:')) return `Відсутній обов’язковий параметр: ${code.slice(22)}`;
  if (code.startsWith('material_relaxation:')) return `Послаблено важливий параметр: ${code.slice(20)}`;
  const labels: Record<string, string> = {
    attributes_mileage_required: 'Для пошуку за параметрами потрібен фактичний пробіг',
    missing_omni_id: 'Немає ідентифікатора оголошення AUTO.RIA',
    source_capture_time_missing: 'Джерело не повернуло час оцінки',
    source_evidence_stale: 'Оцінка джерела застаріла',
    provider_statistics_unavailable: 'Немає статистики порівнянних оголошень',
    provider_comparable_summary_unavailable: 'Джерело не повернуло перелік порівнянних оголошень',
    provider_comparable_evidence_insufficient: 'Недостатньо збережених порівнянних оголошень',
    legacy_delta_at_least_20_pct: 'Різниця з поточною базовою оцінкою становить щонайменше 20%',
    legacy_currency_missing: 'Немає валюти для безпечного порівняння з базовою оцінкою',
    legacy_currency_mismatch: 'Валюта оцінки джерела не збігається з валютою базової оцінки',
    provider_estimate_missing: 'Джерело не повернуло числову оцінку',
    provider_estimate_invalid: 'Джерело повернуло некоректну числову оцінку',
    provider_currency_missing: 'Джерело не повернуло валюту оцінки',
  };
  if (code.startsWith('material_dimension_missing:')) {
    return `Відсутній важливий параметр порівняння: ${code.slice(27)}`;
  }
  return labels[code] ?? code;
}

function missingReasons(queryMode: 'omni_id' | 'attributes', missingFacts: readonly string[]): string[] {
  return missingFacts.map((fact) =>
    queryMode === 'attributes' && (fact === 'mileage' || fact === 'mileageK')
      ? 'attributes_mileage_required'
      : `missing_required_fact:${fact}`,
  );
}

function isMaterialLegacyDelta(
  deltaPct: number | null | undefined,
  policy: ValuationPolicyDefinition,
): boolean {
  if (!Number.isFinite(deltaPct)) return false;
  const lowestBucket = Math.min(...policy.rules.discrepancyBucketsPct);
  return Number.isFinite(lowestBucket) && Math.abs(deltaPct as number) >= lowestBucket;
}

function appendComparableEvidenceReasons(
  input: ComparabilityInput,
  policy: ValuationPolicyDefinition,
  reasons: string[],
): void {
  if (input.providerComparableSummaryAvailable !== true) {
    reasons.push('provider_comparable_summary_unavailable');
    return;
  }

  const minimum = Math.max(1, Math.floor(policy.rules.minimumComparableCount));
  if (
    !isComparableCountAtLeast(input.providerReturnedComparableCount, minimum) ||
    !isComparableCountAtLeast(input.providerRetainedComparableCount, minimum)
  ) {
    reasons.push('provider_comparable_evidence_insufficient');
  }
}

function isComparableCountAtLeast(value: number | null | undefined, minimum: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum;
}

function normalizedCurrency(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : null;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function factFrom(facts: object, name: string): { availability?: unknown; value?: unknown } | undefined {
  const record = facts as Record<string, unknown>;
  const direct = record[name];
  if (typeof direct === 'object' && direct !== null) return direct as { availability?: unknown; value?: unknown };
  if (name === 'mileageK' && typeof record.mileage === 'object' && record.mileage !== null) {
    return record.mileage as { availability?: unknown; value?: unknown };
  }
  return undefined;
}

function isSensitiveField(key: string): boolean {
  const normalized = key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  return new Set([
    'api_key',
    'authorization',
    'bearer',
    'token',
    'secret',
    'password',
    'vin',
    'raw_vin',
    'plate',
    'phone',
    'email',
    'seller',
    'contact',
    'description',
    'comment',
    'raw_payload',
    'url',
  ]).has(normalized);
}
