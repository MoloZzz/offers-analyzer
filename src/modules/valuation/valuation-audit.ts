import { ValuationEvidence } from './entities/valuation-evidence.entity';
import {
  LegacyValuationReference,
  ValuationChargeStatus,
  ValuationComparability,
  ValuationEvidenceStatus,
  ValuationQueryMode,
} from './valuation-evidence.types';
import { REQUIRED_GOLD_STRATA, VALUATION_GOLD_CASES } from './valuation-gold-cases';

/** Optional registry metadata may be joined by a caller; the audit stays database/source-free. */
export interface ValuationAuditRecord {
  status: ValuationEvidenceStatus;
  comparability: ValuationComparability;
  queryMode: ValuationQueryMode;
  failureCode?: string | null;
  comparabilityReasons?: readonly string[];
  chargeStatus: ValuationChargeStatus;
  selectionReason: string;
  trigger: string;
  providerKey: string;
  requestFingerprint?: string;
  estimateAmount?: number | null;
  currency?: string | null;
  legacyReference?: LegacyValuationReference | null;
  goldCaseKey?: string;
  strata?: readonly string[];
}

/** Read-only budget projection supplied by QueryService; it never triggers a provider request. */
export interface ValuationAuditBudget {
  allocation: number | null;
  used: number;
  forecast: number;
  deferredCount: number;
  poolRemaining: number | null;
  reconciliationDifference: number | null;
}

export interface ValuationAuditDigest {
  total: number;
  hasData: boolean;
  /** Attempts selected by manual/sample/gold-case policy, including explicit deferrals. */
  selectedCount: number;
  /** Attempts that reached a provider outcome (available or unavailable), never a hidden fallback. */
  admittedCount: number;
  eligibleCount: number;
  reviewCaseCount: number;
  deltaAtLeast20Count: number;
  statusCounts: Record<ValuationEvidenceStatus, number>;
  comparabilityCounts: Record<ValuationComparability, number>;
  queryModeCounts: Record<ValuationQueryMode, number>;
  failureCounts: Record<string, number>;
  qualityReasonCounts: Record<string, number>;
  chargeStatusCounts: Record<ValuationChargeStatus, number>;
  selectionReasonCounts: Record<string, number>;
  triggerCounts: Record<string, number>;
  providerCounts: Record<string, number>;
  strataCounts: Record<string, number>;
  retryRecordCount: number;
  /** Latency/cache reuse are not yet persisted, so audit reports their absence rather than inventing metrics. */
  telemetry: {
    latencyCaptured: false;
    cacheReuseCaptured: false;
  };
  budget?: ValuationAuditBudget;
  goldCorpus: {
    expectedCases: number;
    observedCaseKeys: string[];
    pendingCaseKeys: string[];
    expectedStrata: string[];
    observedStrata: string[];
    parity: {
      comparedCount: number;
      withinThresholdCount: number;
      atLeastThresholdCount: number;
      currencyMismatchCount: number;
      providerEstimateMissingCount: number;
      manualObservationPendingCount: number;
    };
  };
}

/**
 * Pure aggregation over persisted evidence.  It intentionally receives records rather than a
 * repository/provider so an audit cannot spend source budget or change live scoring.
 */
export function buildValuationAuditDigest(
  records: readonly ValuationAuditRecord[] | readonly ValuationEvidence[],
  options: { deltaThresholdPct?: number; budget?: ValuationAuditBudget } = {},
): ValuationAuditDigest {
  const deltaThresholdPct = options.deltaThresholdPct ?? 20;
  const digest: ValuationAuditDigest = {
    total: records.length,
    hasData: records.length > 0,
    selectedCount: 0,
    admittedCount: 0,
    eligibleCount: 0,
    reviewCaseCount: 0,
    deltaAtLeast20Count: 0,
    statusCounts: {
      not_configured: 0,
      invalid_input: 0,
      deferred: 0,
      unavailable: 0,
      available: 0,
    },
    comparabilityCounts: { eligible: 0, review: 0, not_assessed: 0 },
    queryModeCounts: { omni_id: 0, attributes: 0 },
    failureCounts: {},
    qualityReasonCounts: {},
    chargeStatusCounts: { charged: 0, not_charged: 0, unknown: 0, not_applicable: 0 },
    selectionReasonCounts: {},
    triggerCounts: {},
    providerCounts: {},
    strataCounts: {},
    retryRecordCount: 0,
    telemetry: { latencyCaptured: false, cacheReuseCaptured: false },
    ...(options.budget ? { budget: options.budget } : {}),
    goldCorpus: {
      expectedCases: VALUATION_GOLD_CASES.length,
      observedCaseKeys: [],
      pendingCaseKeys: VALUATION_GOLD_CASES.map((goldCase) => goldCase.key),
      expectedStrata: [...REQUIRED_GOLD_STRATA],
      observedStrata: [],
      parity: {
        comparedCount: 0,
        withinThresholdCount: 0,
        atLeastThresholdCount: 0,
        currencyMismatchCount: 0,
        providerEstimateMissingCount: 0,
        manualObservationPendingCount: 0,
      },
    },
  };
  const observedGoldCases = new Set<string>();
  const fingerprintCounts = new Map<string, number>();
  const latestGoldRecord = new Map<string, ValuationAuditRecord>();

  for (const record of records) {
    digest.statusCounts[record.status] += 1;
    digest.comparabilityCounts[record.comparability] += 1;
    digest.queryModeCounts[record.queryMode] += 1;
    digest.chargeStatusCounts[record.chargeStatus] += 1;
    increment(digest.selectionReasonCounts, record.selectionReason);
    increment(digest.triggerCounts, record.trigger);
    increment(digest.providerCounts, record.providerKey);
    if (record.failureCode) increment(digest.failureCounts, record.failureCode);
    for (const reason of record.comparabilityReasons ?? []) {
      increment(digest.qualityReasonCounts, reason);
    }
    for (const stratum of auditStrata(record)) increment(digest.strataCounts, stratum);
    if ('goldCaseKey' in record && record.goldCaseKey) {
      observedGoldCases.add(record.goldCaseKey);
      latestGoldRecord.set(record.goldCaseKey, record);
    }
    if (record.requestFingerprint) {
      fingerprintCounts.set(
        record.requestFingerprint,
        (fingerprintCounts.get(record.requestFingerprint) ?? 0) + 1,
      );
    }

    // Every stored evidence row is a selected manual/sample/gold attempt; explicit terminal
    // states preserve coverage rather than disappearing from the denominator.
    digest.selectedCount += 1;
    if (
      record.status === 'available' ||
      record.status === 'unavailable' ||
      record.failureCode === 'source_rate_limited'
    ) {
      digest.admittedCount += 1;
    }
    if (record.comparability === 'eligible') digest.eligibleCount += 1;

    const hasLargeDelta = hasDeltaAtLeast(record.legacyReference, deltaThresholdPct);
    if (hasLargeDelta) digest.deltaAtLeast20Count += 1;
    if (record.comparability === 'review' || hasLargeDelta) digest.reviewCaseCount += 1;
  }

  digest.goldCorpus.observedCaseKeys = [...observedGoldCases].sort();
  digest.goldCorpus.pendingCaseKeys = VALUATION_GOLD_CASES.map((goldCase) => goldCase.key).filter(
    (key) => !observedGoldCases.has(key),
  );
  digest.goldCorpus.observedStrata = Object.keys(digest.strataCounts).sort();
  digest.retryRecordCount = [...fingerprintCounts.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );
  digest.goldCorpus.parity = buildGoldParity(latestGoldRecord, deltaThresholdPct);

  return digest;
}

export function hasDeltaAtLeast(
  legacyReference: LegacyValuationReference | null | undefined,
  thresholdPct = 20,
): boolean {
  const delta = legacyReference?.providerDeltaPct;
  return Number.isFinite(delta) && Math.abs(delta as number) >= thresholdPct;
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function auditStrata(record: ValuationAuditRecord | ValuationEvidence): readonly string[] {
  return 'strata' in record ? record.strata ?? [] : [];
}

function buildGoldParity(
  records: ReadonlyMap<string, ValuationAuditRecord>,
  thresholdPct: number,
): ValuationAuditDigest['goldCorpus']['parity'] {
  const parity: ValuationAuditDigest['goldCorpus']['parity'] = {
    comparedCount: 0,
    withinThresholdCount: 0,
    atLeastThresholdCount: 0,
    currencyMismatchCount: 0,
    providerEstimateMissingCount: 0,
    manualObservationPendingCount: 0,
  };

  for (const goldCase of VALUATION_GOLD_CASES) {
    if (!goldCase.manualParity) {
      parity.manualObservationPendingCount += 1;
      continue;
    }
    const record = records.get(goldCase.key);
    if (!record || !isPositiveFinite(record.estimateAmount)) {
      parity.providerEstimateMissingCount += 1;
      continue;
    }
    if (normalizeCurrency(record.currency) !== normalizeCurrency(goldCase.manualParity.currency)) {
      parity.currencyMismatchCount += 1;
      continue;
    }
    parity.comparedCount += 1;
    const deltaPct =
      ((record.estimateAmount - goldCase.manualParity.publicEstimateAmount) /
        goldCase.manualParity.publicEstimateAmount) *
      100;
    if (Math.abs(deltaPct) >= thresholdPct) parity.atLeastThresholdCount += 1;
    else parity.withinThresholdCount += 1;
  }
  return parity;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function normalizeCurrency(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized ? normalized : null;
}
