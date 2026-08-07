import { BudgetActivity, BudgetOperation } from './entities/budget-activity.entity';
import { MonthlyBudgetState } from './entities/monthly-budget-state.entity';
import { OperationBudgetState } from './entities/operation-budget-state.entity';

export interface BudgetReportDigest {
  poolSize: number;
  poolUsed: number;
  poolRemaining: number;
  dailyBudget: number;
  dailyUsed: number;
  dailyRemaining: number;
  reserveAmount: number;
  reserveActive: number;
  reserveReleased: boolean;
  ledgerAllowed: number;
  reconciliationDifference: number;
  forecastMonthEnd: number;
  operationActual: Array<{
    operation: BudgetOperation;
    actual: number;
    forecast: number;
    allocation: number;
  }>;
  profileActual: Array<{
    operation: BudgetOperation;
    profileName: string;
    tier: number;
    actual: number;
  }>;
  deferred: Array<{
    operation: BudgetOperation;
    profileName: string | null;
    tier: number;
    reason: string;
    count: number;
  }>;
  rolloutReady: boolean;
  rolloutReason: string;
  /**
   * SPEC-017 SC-007. AI-analysis spend is reported as its **own allocation**, never folded into the
   * AUTO.RIA pool: it is ledgered under a separate source key, so it contributes nothing to
   * `poolUsed`, `ledgerAllowed`, or the reconciliation above. Null when nothing has been attempted.
   */
  aiAnalysis: AiAnalysisBudgetLine | null;
}

export interface AiAnalysisBudgetLine {
  allocation: number;
  used: number;
  attempts: number;
  refused: number;
}

const ALLOCATIONS: Record<BudgetOperation, number> = {
  search: 3500,
  new_listing_detail: 6000,
  recheck_detail: 4300,
  sweep: 0,
  cohort_average: 1500,
  on_demand: 0,
  valuation_ai: 0,
  // Not an AUTO.RIA request line at all: its capacity lives under its own source key and is
  // reported separately. A non-zero value here would imply it draws on the source pool.
  ai_analysis: 0,
};

export function buildBudgetReport(
  state: MonthlyBudgetState,
  activities: BudgetActivity[],
  now = new Date(),
  operationStates: OperationBudgetState[] = [],
  aiAnalysis?: { state: OperationBudgetState | null; activities: BudgetActivity[] },
): BudgetReportDigest {
  const allowed = activities.filter((a) => a.outcome === 'allowed');
  const ledgerAllowed = allowed.reduce((sum, a) => sum + a.cost, 0);
  const daysElapsed = Math.max(1, now.getUTCDate());
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const byOperation = new Map<BudgetOperation, number>();
  for (const item of allowed)
    byOperation.set(item.operation, (byOperation.get(item.operation) ?? 0) + item.cost);
  const allocationByOperation = new Map<BudgetOperation, number>();
  for (const operationState of operationStates) {
    allocationByOperation.set(operationState.operation, operationState.capacity);
  }
  const operationActual = (Object.keys(ALLOCATIONS) as BudgetOperation[]).map((operation) => {
    const actual = byOperation.get(operation) ?? 0;
    return {
      operation,
      actual,
      forecast: Math.ceil((actual / daysElapsed) * daysInMonth),
      allocation: allocationByOperation.get(operation) ?? ALLOCATIONS[operation],
    };
  });
  const profileGroups = new Map<
    string,
    { operation: BudgetOperation; profileName: string; tier: number; actual: number }
  >();
  for (const item of allowed) {
    if (!item.profileName) continue;
    const key = `${item.operation}|${item.profileName}|${item.priorityTier}`;
    const group = profileGroups.get(key) ?? {
      operation: item.operation,
      profileName: item.profileName,
      tier: item.priorityTier,
      actual: 0,
    };
    group.actual += item.cost;
    profileGroups.set(key, group);
  }
  const denied = activities.filter((a) => a.outcome === 'denied');
  const groups = new Map<
    string,
    {
      operation: BudgetOperation;
      profileName: string | null;
      tier: number;
      reason: string;
      count: number;
    }
  >();
  for (const item of denied) {
    const key = `${item.operation}|${item.profileName ?? ''}|${item.priorityTier}|${item.reason}`;
    const group = groups.get(key) ?? {
      operation: item.operation,
      profileName: item.profileName ?? null,
      tier: item.priorityTier,
      reason: item.reason,
      count: 0,
    };
    group.count += item.cost;
    groups.set(key, group);
  }
  const reconciliationDifference = state.poolUsed - ledgerAllowed;
  const reserveReleased = now >= state.reserveReleasesAt;
  const reserveActive = reserveReleased ? 0 : state.reserveAmount;
  const forecastMonthEnd = Math.ceil((state.poolUsed / daysElapsed) * daysInMonth);
  const noEvidence = activities.length === 0;
  const overForecast =
    forecastMonthEnd > state.poolSize ||
    operationActual.some((line) => line.allocation > 0 && line.forecast > line.allocation);
  const rolloutReady = !noEvidence && reconciliationDifference === 0 && !overForecast;
  const rolloutReason = noEvidence
    ? 'немає поточних записів витрат'
    : reconciliationDifference !== 0
      ? 'ledger не звіряється з місячним лічильником'
      : overForecast
        ? 'прогноз перевищує пул або індикативну алокацію'
        : 'потрібне ручне схвалення reforecast';
  return {
    poolSize: state.poolSize,
    poolUsed: state.poolUsed,
    poolRemaining: Math.max(0, state.poolSize - state.poolUsed),
    dailyBudget: state.dailyBudget,
    dailyUsed: state.dailyUsed,
    dailyRemaining: Math.max(0, state.dailyBudget - state.dailyUsed),
    reserveAmount: state.reserveAmount,
    reserveActive,
    reserveReleased,
    ledgerAllowed,
    reconciliationDifference,
    forecastMonthEnd,
    operationActual,
    profileActual: [...profileGroups.values()],
    deferred: [...groups.values()],
    rolloutReady,
    rolloutReason,
    aiAnalysis: buildAiAnalysisLine(aiAnalysis),
  };
}

function buildAiAnalysisLine(
  input?: { state: OperationBudgetState | null; activities: BudgetActivity[] },
): AiAnalysisBudgetLine | null {
  if (!input || (!input.state && input.activities.length === 0)) return null;
  const attempts = input.activities.filter((a) => a.outcome === 'allowed').length;
  return {
    allocation: input.state?.capacity ?? 0,
    used: input.state?.used ?? attempts,
    attempts,
    refused: input.activities.length - attempts,
  };
}

export function formatBudgetReport(d: BudgetReportDigest): string {
  const lines = [
    '📦 Бюджет AUTO.RIA',
    `Місяць: ${d.poolUsed}/${d.poolSize} · залишок ${d.poolRemaining} · прогноз ${d.forecastMonthEnd}`,
    `Сьогодні: ${d.dailyUsed}/${d.dailyBudget} · залишок ${d.dailyRemaining}`,
    `Резерв: ${d.reserveActive}/${d.reserveAmount}${d.reserveReleased ? ' (вивільнений)' : ' (утримується)'}`,
    `Звірка ledger: ${d.ledgerAllowed}; різниця ${d.reconciliationDifference === 0 ? '0 ✓' : d.reconciliationDifference + ' ⚠️'}`,
    'Витрати / прогноз / ADR-0009:',
    ...d.operationActual
      .filter((x) => x.actual > 0 || x.allocation > 0)
      .map((x) => `• ${x.operation}: ${x.actual} / ${x.forecast} / ${x.allocation || '—'}`),
  ];
  if (d.profileActual.length)
    lines.push(
      'За профілем:',
      ...d.profileActual.map(
        (x) => `• ${x.profileName}: ${x.operation}, tier ${x.tier} — ${x.actual}`,
      ),
    );
  if (d.deferred.length)
    lines.push(
      'Відкладено:',
      ...d.deferred.map(
        (x) =>
          `• ${x.operation}${x.profileName ? ` (${x.profileName})` : ''}, tier ${x.tier}: ${x.count} — ${x.reason}`,
      ),
    );
  if (d.aiAnalysis)
    lines.push(
      '🤖 AI-аналіз (окрема алокація, не з пулу AUTO.RIA):',
      `• ${d.aiAnalysis.used}/${d.aiAnalysis.allocation || '—'} · виконано ${d.aiAnalysis.attempts} · відмов ${d.aiAnalysis.refused}`,
    );
  lines.push(
    `Rollout SPEC-005/новий профіль: ${d.rolloutReady ? 'evidence ready (потрібне ручне схвалення)' : 'НЕ готово'} — ${d.rolloutReason}`,
  );
  return lines.join('\n');
}
