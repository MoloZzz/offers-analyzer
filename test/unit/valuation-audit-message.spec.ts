import { formatValuationAudit } from '../../src/modules/notifications/format/valuation-audit-message';

describe('formatValuationAudit', () => {
  it('explains that absent evidence is not a positive audit result', () => {
    expect(
      formatValuationAudit({
        hasData: false,
        total: 0,
        selectedCount: 0,
        admittedCount: 0,
        reviewCaseCount: 0,
        deltaAtLeast20Count: 0,
        statusCounts: {},
        comparabilityCounts: {},
        queryModeCounts: {},
        failureCounts: {},
        chargeStatusCounts: {},
      }),
    ).toContain('ще немає');
  });

  it('labels provider evidence as shadow-only and not a sale price', () => {
    const message = formatValuationAudit({
      hasData: true,
      total: 5,
      selectedCount: 5,
      admittedCount: 3,
      reviewCaseCount: 2,
      deltaAtLeast20Count: 1,
      statusCounts: { available: 2, deferred: 1, unavailable: 2 },
      comparabilityCounts: { eligible: 1, review: 1, not_assessed: 3 },
      queryModeCounts: { omni_id: 4, attributes: 1 },
      failureCounts: { source_rate_limited: 1 },
      chargeStatusCounts: { unknown: 1, not_charged: 4 },
      retryRecordCount: 1,
      telemetry: { latencyCaptured: false, cacheReuseCaptured: false },
      budget: {
        allocation: 20,
        used: 3,
        forecast: 10,
        deferredCount: 2,
        poolRemaining: 100,
        reconciliationDifference: 0,
      },
    });

    expect(message).toContain('shadow-only');
    expect(message).toContain('≥20%: 1');
    expect(message).toContain('Бюджет valuation_ai');
    expect(message).toContain('Телеметрія');
    expect(message).toContain('не підтверджені ціни продажу');
  });
});
