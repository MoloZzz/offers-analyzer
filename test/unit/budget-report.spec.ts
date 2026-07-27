import { buildBudgetReport, formatBudgetReport } from '../../src/modules/scheduling/budget-report';
import { BudgetActivity } from '../../src/modules/scheduling/entities/budget-activity.entity';
import { MonthlyBudgetState } from '../../src/modules/scheduling/entities/monthly-budget-state.entity';

const state = {
  poolSize: 20000,
  poolUsed: 12,
  reserveAmount: 3000,
  reserveReleasesAt: new Date('2026-07-29T00:00:00Z'),
  dailyBudget: 1000,
  dailyUsed: 12,
} as MonthlyBudgetState;

function activity(partial: Partial<BudgetActivity>): BudgetActivity {
  return {
    sourceKey: 'auto-ria',
    monthKey: '202607',
    operation: 'search',
    priorityTier: 3,
    cost: 1,
    outcome: 'allowed',
    reason: 'allowed',
    createdAt: new Date('2026-07-15T12:00:00Z'),
    ...partial,
  } as BudgetActivity;
}

describe('buildBudgetReport', () => {
  it('reconciles attributed allowed spend and groups deferred work', () => {
    const digest = buildBudgetReport(
      state,
      [
        activity({ operation: 'search', cost: 5, profileName: 'Kyiv' }),
        activity({ operation: 'recheck_detail', priorityTier: 1, cost: 7, profileName: 'Kyiv' }),
        activity({
          operation: 'cohort_average',
          priorityTier: 5,
          outcome: 'denied',
          reason: 'tier_cutoff',
          cost: 2,
        }),
      ],
      new Date('2026-07-15T12:00:00Z'),
    );

    expect(digest.ledgerAllowed).toBe(12);
    expect(digest.reconciliationDifference).toBe(0);
    expect(digest.deferred).toEqual([
      expect.objectContaining({ operation: 'cohort_average', reason: 'tier_cutoff', count: 2 }),
    ]);
    expect(digest.rolloutReady).toBe(true);
    expect(formatBudgetReport(digest)).toContain('Kyiv');
  });

  it('flags missing history and a mismatch instead of silently correcting it', () => {
    const empty = buildBudgetReport(state, [], new Date('2026-07-15T12:00:00Z'));
    expect(empty.rolloutReady).toBe(false);
    expect(empty.reconciliationDifference).toBe(12);
    expect(formatBudgetReport(empty)).toContain('⚠️');
  });
});
