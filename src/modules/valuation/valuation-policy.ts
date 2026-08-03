import { createHash } from 'crypto';

import {
  ACTIVE_LISTING_ASK_TARGET,
  ValuationPolicyDefinition,
  ValuationPolicyRules,
  ValuationPolicySnapshot,
  ValuationQueryMode,
} from './valuation-evidence.types';

/**
 * Code-owned first shadow policy.  Configuration controls whether sampling is enabled; this
 * policy only fixes the deterministic algorithm and quality requirements for a version.
 */
export const AI_SHADOW_V1_POLICY: ValuationPolicyDefinition = deepFreeze({
  key: 'ai-shadow-v1',
  target: ACTIVE_LISTING_ASK_TARGET,
  status: 'shadow',
  rules: {
    target: ACTIVE_LISTING_ASK_TARGET,
    requiredFacts: ['make', 'model', 'year'],
    attributeRequiredFacts: [
      'categoryId',
      'make',
      'model',
      'markId',
      'modelId',
      'year',
      'mileageK',
    ],
    query: {
      preferredMode: 'omni_id',
      attributesRequireActualMileage: true,
    },
    materialDimensions: [
      { code: 'generation', facts: ['generationId', 'generationName'] },
      { code: 'modification', facts: ['modificationId', 'modificationName'] },
      { code: 'body', facts: ['bodyId', 'bodyName'] },
      { code: 'fuel', facts: ['fuelId', 'fuelName'] },
      { code: 'gearbox', facts: ['gearboxId', 'gearboxName'] },
      { code: 'drive', facts: ['driveId', 'driveName'] },
      { code: 'location', facts: ['location'] },
    ],
    minimumComparableCount: 1,
    allowedRelaxations: [],
    freshnessHours: 24,
    sampling: {
      algorithm: 'sha256-mod-10000',
      defaultRate: 0,
    },
    discrepancyBucketsPct: [20],
  },
});

export interface QueryModeDecision {
  queryMode?: ValuationQueryMode;
  reasons: string[];
}

/**
 * Prefer an AUTO.RIA omni ID.  Attribute mode is selected only before a call and only when all
 * policy-required facts, including actual mileage, are present.  A later source failure never
 * triggers fallback to the legacy average endpoint or an alternate mode.
 */
export function decideValuationQueryMode(input: {
  omniId?: string | null;
  facts: object;
  policy?: ValuationPolicyDefinition;
  requestedMode?: ValuationQueryMode;
}): QueryModeDecision {
  const policy = input.policy ?? AI_SHADOW_V1_POLICY;
  const omniId = input.omniId?.trim();

  if (input.requestedMode === 'omni_id' || (!input.requestedMode && omniId)) {
    return omniId
      ? { queryMode: 'omni_id', reasons: [] }
      : { reasons: ['missing_omni_id'] };
  }

  const missing = requiredFactsMissing(input.facts, policy.rules.attributeRequiredFacts);
  if (missing.length > 0) {
    return {
      reasons: missing.map((fact) =>
        fact === 'mileage' || fact === 'mileageK'
          ? 'attributes_mileage_required'
          : `missing_required_fact:${fact}`,
      ),
    };
  }

  return { queryMode: 'attributes', reasons: [] };
}

/** The required input check is pure so source calls can be blocked before admission. */
export function requiredFactsMissing<T extends object>(
  facts: T,
  requiredFacts: readonly string[],
): string[] {
  return requiredFacts.filter((name) => !hasUsableFact(factFor(facts, name)));
}

/** Numeric IDs/year (and actual mileage) must be positive; no zero sentinel is provider-usable. */
export function hasUsableFact(fact: FactLike): boolean {
  if (!fact || fact.availability !== 'available') return false;
  const value = fact.value;
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return false;
    return value > 0;
  }
  return true;
}

type FactLike = { availability?: unknown; value?: unknown } | undefined;

function factFor(facts: object, name: string): FactLike {
  const record = facts as Record<string, unknown>;
  const direct = record[name];
  if (isFactLike(direct)) return direct;

  // `mileage` was used in the first draft of the policy; accept it as an input alias while all
  // persisted ai-shadow-v1 records use the source-port name `mileageK`.
  if (name === 'mileageK' && isFactLike(record.mileage)) return record.mileage;
  if (name === 'mileage' && isFactLike(record.mileageK)) return record.mileageK;
  return undefined;
}

function isFactLike(value: unknown): value is Exclude<FactLike, undefined> {
  return typeof value === 'object' && value !== null;
}

/**
 * Stable selection for a configured sample rate.  The policy key is part of the hash so a new
 * policy gets an independent deterministic sample without reinterpreting old evidence.
 */
export function selectDeterministicShadowSample(
  externalId: string,
  policyKey: string,
  sampleRate: number,
): boolean {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return false;
  if (sampleRate >= 1) return true;
  return deterministicSampleUnit(externalId, policyKey) < sampleRate;
}

/** A public bucket helps audit deterministic selection without exposing a hash implementation. */
export function deterministicSampleUnit(externalId: string, policyKey: string): number {
  const digest = createHash('sha256').update(`${policyKey}\u0000${externalId}`).digest();
  const bucket = digest.readUInt32BE(0) / 0x1_0000_0000;
  return bucket;
}

/** A canonical, immutable policy projection stored on evidence records. */
export function snapshotValuationPolicy(policy: ValuationPolicyDefinition): ValuationPolicySnapshot {
  const rules = cloneRules(policy.rules);
  const digest = createHash('sha256')
    .update(JSON.stringify({ key: policy.key, target: policy.target, status: policy.status, rules }))
    .digest('hex');
  return {
    key: policy.key,
    target: policy.target,
    status: policy.status,
    rules,
    digest,
  };
}

function cloneRules(rules: ValuationPolicyRules): ValuationPolicyRules {
  return {
    target: rules.target,
    requiredFacts: [...rules.requiredFacts],
    attributeRequiredFacts: [...rules.attributeRequiredFacts],
    query: { ...rules.query },
    materialDimensions: rules.materialDimensions.map((dimension) => ({
      code: dimension.code,
      facts: [...dimension.facts],
    })),
    minimumComparableCount: rules.minimumComparableCount,
    allowedRelaxations: [...rules.allowedRelaxations],
    freshnessHours: rules.freshnessHours,
    sampling: { ...rules.sampling },
    discrepancyBucketsPct: [...rules.discrepancyBucketsPct],
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
