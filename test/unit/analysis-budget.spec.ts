/**
 * SPEC-017 T009 — containment, proved before the first live call (US17.4, FR-006, FR-007, SC-002).
 *
 * The load-bearing claim is not "the cap works" but "the cap is **separate**": AI spend is ledgered
 * under its own source key and admitted against its own allocation, so no outcome on this path —
 * admitted, refused, or compensated — can decrement the 20,000-request AUTO.RIA pool that funds
 * discovery. Every case here asserts that alongside the behaviour under test.
 */
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { AppConfig } from '../../src/common/config/configuration';
import { BudgetActivity } from '../../src/modules/scheduling/entities/budget-activity.entity';
import { MonthlyBudgetState } from '../../src/modules/scheduling/entities/monthly-budget-state.entity';
import { OperationBudgetState } from '../../src/modules/scheduling/entities/operation-budget-state.entity';
import { RateBudgetWindow } from '../../src/modules/scheduling/entities/rate-budget-window.entity';
import {
  AI_ANALYSIS_SOURCE_KEY,
  AiAnalysisBudgetRequestContext,
  RateBudgetService,
} from '../../src/modules/scheduling/rate-budget.service';

const fakeLogger = { warn: jest.fn(), debug: jest.fn(), error: jest.fn() };

function buildActivityRepo(): { repo: Repository<BudgetActivity>; rows: BudgetActivity[] } {
  const rows: BudgetActivity[] = [];
  const repo = {
    create: (x: Partial<BudgetActivity>) =>
      ({ id: `activity-${rows.length + 1}`, createdAt: new Date(), ...x }) as BudgetActivity,
    save: (x: BudgetActivity) => {
      rows.push(x);
      return Promise.resolve(x);
    },
    count: ({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        rows.filter((row) =>
          Object.entries(where).every(([key, value]) =>
            // The only non-scalar predicate is the rolling window on `createdAt`; every row this
            // fake creates is "now", so any window matches.
            key === 'createdAt' ? true : (row as never)[key] === value,
          ),
        ).length,
      ),
    find: () => Promise.resolve(rows),
  } as unknown as Repository<BudgetActivity>;
  return { repo, rows };
}

/** In-memory interpretation of the atomic allocation upsert. */
function buildOperationStateRepo(): {
  repo: Repository<OperationBudgetState>;
  rows: OperationBudgetState[];
} {
  const rows: OperationBudgetState[] = [];
  let nextId = 1;
  const query = jest.fn((sql: string, values: unknown[]) => {
    const [sourceKey, monthKey, operation, ...rest] = values as [string, string, string, ...number[]];
    const existing = rows.find(
      (row) => row.sourceKey === sourceKey && row.monthKey === monthKey && row.operation === operation,
    );
    if (sql.includes('INSERT INTO operation_budget_states')) {
      const [capacity, cost] = rest;
      if (!existing) {
        if (cost > capacity) return [];
        const created = {
          id: `op-${nextId++}`,
          sourceKey,
          monthKey,
          operation,
          capacity,
          used: cost,
          updatedAt: new Date(),
        } as OperationBudgetState;
        rows.push(created);
        return [{ id: created.id }];
      }
      existing.capacity = capacity;
      if (existing.used + cost > capacity) return [];
      existing.used += cost;
      return [{ id: existing.id }];
    }
    if (sql.includes('UPDATE operation_budget_states') && existing) {
      existing.used = Math.max(0, existing.used - rest[0]);
    }
    return [];
  });
  const repo = {
    query,
    find: () => Promise.resolve(rows),
    findOne: ({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        rows.find((row) =>
          Object.entries(where).every(([key, value]) => (row as never)[key] === value),
        ) ?? null,
      ),
  } as unknown as Repository<OperationBudgetState>;
  return { repo, rows };
}

/** The AUTO.RIA pool. Any write to it during an AI call would be the failure SC-002 forbids. */
function buildStateRepo(): {
  repo: Repository<MonthlyBudgetState>;
  rows: MonthlyBudgetState[];
  query: jest.Mock;
} {
  const rows: MonthlyBudgetState[] = [];
  const query = jest.fn(() => []);
  const repo = {
    query,
    findOne: () => Promise.resolve(rows[0] ?? null),
    create: (x: Partial<MonthlyBudgetState>) => ({ id: 'state-1', ...x }) as MonthlyBudgetState,
    save: (x: MonthlyBudgetState) => {
      rows.push(x);
      return Promise.resolve(x);
    },
  } as unknown as Repository<MonthlyBudgetState>;
  return { repo, rows, query };
}

function buildService(overrides: Partial<AppConfig> = {}) {
  const config = {
    get: (key: keyof AppConfig) =>
      ({
        rateBudgetPerHour: 30,
        rateBudgetPoolPerMonth: 20000,
        rateBudgetReservePct: 15,
        rateBudgetCutoffThresholdPct: 10,
        ...overrides,
      })[key as string],
  } as unknown as ConfigService<AppConfig, true>;
  const state = buildStateRepo();
  const activity = buildActivityRepo();
  const operation = buildOperationStateRepo();
  const service = new RateBudgetService(
    config,
    {} as unknown as Repository<RateBudgetWindow>,
    state.repo,
    fakeLogger as never,
    activity.repo,
    undefined,
    operation.repo,
  );
  return { service, state, activity, operation };
}

function context(overrides: Partial<AiAnalysisBudgetRequestContext> = {}): AiAnalysisBudgetRequestContext {
  return {
    operation: 'ai_analysis',
    actorId: '77',
    operationMonthlyAllocation: 5,
    perAdminLimit: 10,
    perAdminWindowHours: 24,
    ...overrides,
  };
}

describe('SPEC-017 AI analysis budget — the kill switch (FR-007)', () => {
  it('refuses at a zero cap and never reserves anything', async () => {
    const { service, operation, activity } = buildService();

    const admission = await service.tryConsumeAiAnalysis(context({ operationMonthlyAllocation: 0 }));

    expect(admission.admitted).toBe(false);
    expect(admission.reason).toBe('operation_allocation_exhausted');
    expect(admission.allocation).toBe(0);
    expect(admission.resetsAt).toBeInstanceOf(Date);
    expect(operation.rows).toEqual([]);
    // The refusal is still evidence: it is ledgered, and marked as not charged.
    expect(activity.rows).toHaveLength(1);
    expect(activity.rows[0]).toMatchObject({ outcome: 'denied', chargeStatus: 'not_charged' });
  });

  it('refuses once the monthly cap is exhausted and names the cap and its reset (AS-2)', async () => {
    const { service } = buildService();
    const ctx = context({ operationMonthlyAllocation: 2 });

    expect((await service.tryConsumeAiAnalysis(ctx)).admitted).toBe(true);
    expect((await service.tryConsumeAiAnalysis(ctx)).admitted).toBe(true);
    const third = await service.tryConsumeAiAnalysis(ctx);

    expect(third.admitted).toBe(false);
    expect(third.allocation).toBe(2);
    expect(third.resetsAt).toBeInstanceOf(Date);
  });
});

describe('SPEC-017 AI analysis budget — separation from the AUTO.RIA pool (FR-006, SC-002)', () => {
  it('never touches the AUTO.RIA monthly pool on any outcome', async () => {
    const { service, state, operation } = buildService();

    await service.tryConsumeAiAnalysis(context());
    await service.tryConsumeAiAnalysis(context({ operationMonthlyAllocation: 0 }));
    await service.tryConsumeAiAnalysis(context({ perAdminLimit: 0 }));

    expect(state.rows).toEqual([]);
    expect(state.query).not.toHaveBeenCalled();
    // Everything it did touch lives under the AI source key.
    expect(operation.rows.every((row) => row.sourceKey === AI_ANALYSIS_SOURCE_KEY)).toBe(true);
  });

  it('ledgers AI spend under its own source key and operation', async () => {
    const { service, activity } = buildService();

    await service.tryConsumeAiAnalysis(context());

    expect(activity.rows[0]).toMatchObject({
      sourceKey: AI_ANALYSIS_SOURCE_KEY,
      operation: 'ai_analysis',
      outcome: 'allowed',
      actorId: '77',
    });
  });

  it('reports the AI allocation as its own line, not folded into the pool (SC-007)', async () => {
    const { service } = buildService();
    await service.tryConsumeAiAnalysis(context({ operationMonthlyAllocation: 4 }));

    expect(await service.aiAnalysisAllocation()).toEqual({ allocation: 4, used: 1 });
  });

  it('returns the allocation when an attempt never reached the provider', async () => {
    const { service } = buildService();
    await service.tryConsumeAiAnalysis(context());

    await service.releaseAiAnalysis();

    expect(await service.aiAnalysisAllocation()).toEqual({ allocation: 5, used: 0 });
  });
});

describe('SPEC-017 AI analysis budget — per-admin rate limit (AS-4)', () => {
  it('refuses past the per-admin limit and names it', async () => {
    const { service } = buildService();
    const ctx = context({ perAdminLimit: 2, operationMonthlyAllocation: 100 });

    await service.tryConsumeAiAnalysis(ctx);
    await service.tryConsumeAiAnalysis(ctx);
    const third = await service.tryConsumeAiAnalysis(ctx);

    expect(third.admitted).toBe(false);
    expect(third.reason).toBe('per_admin_rate_limited');
    expect(third.perAdminLimit).toBe(2);
    expect(third.perAdminWindowHours).toBe(24);
  });

  it('counts per admin, so one admin cannot exhaust another admin’s allowance', async () => {
    const { service } = buildService();
    const ctx = context({ perAdminLimit: 1, operationMonthlyAllocation: 100 });

    await service.tryConsumeAiAnalysis(ctx);

    expect((await service.tryConsumeAiAnalysis({ ...ctx, actorId: '99' })).admitted).toBe(true);
  });

  it('checks the limit before reserving, so a rate-limited tap consumes no monthly capacity', async () => {
    const { service } = buildService();
    const ctx = context({ perAdminLimit: 1, operationMonthlyAllocation: 3 });

    await service.tryConsumeAiAnalysis(ctx);
    await service.tryConsumeAiAnalysis(ctx);

    expect(await service.aiAnalysisAllocation()).toEqual({ allocation: 3, used: 1 });
  });
});
