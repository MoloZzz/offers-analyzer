/**
 * Read-only presentation model for the shadow valuation audit.  It intentionally carries only
 * aggregate counts: evidence payloads and provider responses never belong in a Telegram report.
 */
export interface ValuationAuditView {
  hasData: boolean;
  total: number;
  selectedCount: number;
  admittedCount: number;
  reviewCaseCount: number;
  deltaAtLeast20Count: number;
  statusCounts: Record<string, number>;
  comparabilityCounts: Record<string, number>;
  queryModeCounts: Record<string, number>;
  failureCounts: Record<string, number>;
  qualityReasonCounts?: Record<string, number>;
  chargeStatusCounts: Record<string, number>;
  retryRecordCount?: number;
  telemetry?: {
    latencyCaptured: boolean;
    cacheReuseCaptured: boolean;
  };
  budget?: {
    allocation: number | null;
    used: number;
    forecast: number;
    deferredCount: number;
    poolRemaining: number | null;
    reconciliationDifference: number | null;
  };
  goldCorpus?: {
    expectedCases: number;
    observedCaseKeys: string[];
    pendingCaseKeys: string[];
    expectedStrata: string[];
    observedStrata: string[];
    parity?: {
      comparedCount: number;
      withinThresholdCount: number;
      atLeastThresholdCount: number;
      currencyMismatchCount: number;
      providerEstimateMissingCount: number;
      manualObservationPendingCount: number;
    };
  };
}

/** Render a compact Ukrainian, source-free audit summary for administrators. */
export function formatValuationAudit(digest: ValuationAuditView | null): string {
  if (!digest || !digest.hasData) {
    return (
      '📊 Аудит ринкових оцінок AUTO.RIA\n' +
      'Записів shadow-оцінки ще немає. Увімкніть контрольовану вибірку лише після підтвердження доступу та бюджету.'
    );
  }

  const lines = [
    '📊 Аудит ринкових оцінок AUTO.RIA (shadow-only)',
    `Записів: ${digest.total}; вибрано: ${digest.selectedCount}; допущено до запиту: ${digest.admittedCount}.`,
    `Стани: ${formatCounts(digest.statusCounts)}.`,
    `Порівнюваність: ${formatCounts(digest.comparabilityCounts)}.`,
    `Режими запиту: ${formatCounts(digest.queryModeCounts)}.`,
    `Випадки review: ${digest.reviewCaseCount}; різниця з legacy ≥20%: ${digest.deltaAtLeast20Count}.`,
    `Списання: ${formatCounts(digest.chargeStatusCounts)}.`,
  ];
  if (Object.keys(digest.failureCounts).length > 0) {
    lines.push(`Невдачі джерела: ${formatCounts(digest.failureCounts)}.`);
  }
  if (digest.qualityReasonCounts && Object.keys(digest.qualityReasonCounts).length > 0) {
    lines.push(`Причини review/якості: ${formatCounts(digest.qualityReasonCounts)}.`);
  }
  if (digest.retryRecordCount != null) {
    lines.push(`Повторні записи за fingerprint: ${digest.retryRecordCount}.`);
  }
  if (digest.telemetry) {
    lines.push(
      `Телеметрія: latency ${digest.telemetry.latencyCaptured ? 'збережено' : 'ще не зберігається'}; ` +
        `cache/dedup ${digest.telemetry.cacheReuseCaptured ? 'збережено' : 'ще не зберігається'}.`,
    );
  }
  if (digest.budget) {
    lines.push(
      `Бюджет valuation_ai: ${digest.budget.used}/${digest.budget.allocation ?? '—'}; ` +
        `прогноз ${digest.budget.forecast}; відкладено ${digest.budget.deferredCount}; ` +
        `залишок спільного пулу ${digest.budget.poolRemaining ?? '—'}; ` +
        `звірка ${digest.budget.reconciliationDifference ?? '—'}.`,
    );
  }
  if (digest.goldCorpus) {
    lines.push(
      `Gold corpus: ${digest.goldCorpus.observedCaseKeys.length}/${digest.goldCorpus.expectedCases} записів; ` +
        `покриті страти: ${digest.goldCorpus.observedStrata.join(', ') || 'немає'}.`,
    );
    if (digest.goldCorpus.parity) {
      const parity = digest.goldCorpus.parity;
      lines.push(
        `Gold parity: порівняно ${parity.comparedCount}; в межах порогу ${parity.withinThresholdCount}; ` +
          `≥20% ${parity.atLeastThresholdCount}; валюта не зіставна ${parity.currencyMismatchCount}; ` +
          `немає оцінки провайдера ${parity.providerEstimateMissingCount}; ` +
          `очікують ручний знімок ${parity.manualObservationPendingCount}.`,
      );
    }
  }
  lines.push(
    'Це оцінки активного ринку від провайдера, а не підтверджені ціни продажу; вони не впливають на бал або сповіщення.',
  );
  return lines.join('\n');
}

function formatCounts(counts: Record<string, number>): string {
  const items = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  return items.length > 0 ? items.map(([name, count]) => `${name}: ${count}`).join(', ') : 'немає';
}
