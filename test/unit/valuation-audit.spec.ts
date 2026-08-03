import { buildValuationAuditDigest } from '../../src/modules/valuation/valuation-audit';
import { ValuationAuditRecord } from '../../src/modules/valuation/valuation-audit';

describe('buildValuationAuditDigest', () => {
  it('aggregates persisted shadow evidence without touching a provider or score path', () => {
    const records: ValuationAuditRecord[] = [
      {
        status: 'available',
        comparability: 'review',
        queryMode: 'omni_id',
        chargeStatus: 'charged',
        selectionReason: 'deterministic_sample',
        trigger: 'poll_shadow',
        providerKey: 'auto-ria-ai',
        requestFingerprint: 'same-request',
        estimateAmount: 5000,
        currency: 'USD',
        comparabilityReasons: ['legacy_delta_at_least_20_pct'],
        legacyReference: { providerDeltaPct: -26.74 },
        goldCaseKey: 'audi-a6-allroad-2004-38266770',
        strata: ['old', 'niche', 'high_mileage', 'condition_ambiguous'],
      },
      {
        status: 'invalid_input',
        comparability: 'review',
        queryMode: 'attributes',
        failureCode: 'invalid_input',
        chargeStatus: 'not_applicable',
        selectionReason: 'manual',
        trigger: 'manual_check',
        providerKey: 'auto-ria-ai',
        requestFingerprint: 'same-request',
        strata: ['high-mileage'],
      },
      {
        status: 'deferred',
        comparability: 'not_assessed',
        queryMode: 'omni_id',
        failureCode: 'budget_denied',
        chargeStatus: 'not_charged',
        selectionReason: 'gold_case',
        trigger: 'audit_case',
        providerKey: 'auto-ria-ai',
      },
    ];

    const digest = buildValuationAuditDigest(records);

    expect(digest).toMatchObject({
      total: 3,
      hasData: true,
      selectedCount: 3,
      admittedCount: 1,
      eligibleCount: 0,
      reviewCaseCount: 2,
      deltaAtLeast20Count: 1,
      retryRecordCount: 1,
      statusCounts: { available: 1, invalid_input: 1, deferred: 1 },
      queryModeCounts: { omni_id: 2, attributes: 1 },
      failureCounts: { invalid_input: 1, budget_denied: 1 },
      qualityReasonCounts: { legacy_delta_at_least_20_pct: 1 },
      strataCounts: { old: 1, niche: 1, high_mileage: 1, condition_ambiguous: 1, 'high-mileage': 1 },
    });
    expect(digest.goldCorpus.parity).toMatchObject({
      comparedCount: 1,
      withinThresholdCount: 1,
      atLeastThresholdCount: 0,
      manualObservationPendingCount: 3,
    });
  });

  it('counts a 429 response as admitted while keeping a budget denial outside admission', () => {
    const digest = buildValuationAuditDigest([
      {
        status: 'deferred',
        comparability: 'not_assessed',
        queryMode: 'omni_id',
        failureCode: 'source_rate_limited',
        chargeStatus: 'unknown',
        selectionReason: 'manual',
        trigger: 'manual_check',
        providerKey: 'auto-ria-ai',
      },
      {
        status: 'deferred',
        comparability: 'not_assessed',
        queryMode: 'omni_id',
        failureCode: 'budget_denied',
        chargeStatus: 'not_charged',
        selectionReason: 'manual',
        trigger: 'manual_check',
        providerKey: 'auto-ria-ai',
      },
    ]);

    expect(digest.admittedCount).toBe(1);
  });

  it('reports an explicit empty audit rather than inventing coverage', () => {
    const digest = buildValuationAuditDigest([]);

    expect(digest.hasData).toBe(false);
    expect(digest.total).toBe(0);
    expect(digest.selectedCount).toBe(0);
  });
});
