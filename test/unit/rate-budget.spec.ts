import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { AppConfig } from '../../src/common/config/configuration';
import { BudgetActivity } from '../../src/modules/scheduling/entities/budget-activity.entity';
import { MonthlyBudgetState } from '../../src/modules/scheduling/entities/monthly-budget-state.entity';
import { OperationBudgetState } from '../../src/modules/scheduling/entities/operation-budget-state.entity';
import { RateBudgetWindow } from '../../src/modules/scheduling/entities/rate-budget-window.entity';
import { RateBudgetService } from '../../src/modules/scheduling/rate-budget.service';

/** Minimal fake logger. */
const fakeLogger = {
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
};

/** Fake window repository — tracks hourly windows and monthly pool rows. */
function buildFakeWindowRepo(): { repo: Repository<RateBudgetWindow>; rows: RateBudgetWindow[] } {
  const rows: RateBudgetWindow[] = [];
  let nextId = 1;

  const repo = {
    query: jest.fn(),
    findOne({ where }: { where: Record<string, unknown> }) {
      return Promise.resolve(
        rows.find((row) =>
          Object.entries(where).every(([key, value]) => (row as never)[key] === value),
        ) ?? null,
      );
    },
    create(x: Partial<RateBudgetWindow>) {
      return { id: `id-${nextId++}`, createdAt: new Date(), ...x } as RateBudgetWindow;
    },
    save(x: RateBudgetWindow) {
      const idx = rows.findIndex((row) => row.id === x.id);
      if (idx === -1) {
        rows.push(x);
      } else {
        rows[idx] = x;
      }
      return Promise.resolve(x);
    },
  } as unknown as Repository<RateBudgetWindow>;

  return { repo, rows };
}

/** Fake state repository — tracks monthly budget states. */
function buildFakeStateRepo(): {
  repo: Repository<MonthlyBudgetState>;
  rows: MonthlyBudgetState[];
  query: jest.Mock;
} {
  const rows: MonthlyBudgetState[] = [];
  let nextId = 1;
  const query = jest.fn((sql: string, values: unknown[]) => {
    if (sql.includes('"lastDayCalculated" IS DISTINCT FROM')) {
      const [sourceKey, monthKey, effectiveReserve, daysRemaining, todayStr] = values as [
        string,
        string,
        number,
        number,
        string,
      ];
      const state = rows.find((row) => row.sourceKey === sourceKey && row.monthKey === monthKey);
      if (!state || state.lastDayCalculated === todayStr) return [];
      state.dailyBudget = Math.floor(
        Math.max(0, state.poolSize - state.poolUsed - effectiveReserve) / daysRemaining,
      );
      state.dailyUsed = 0;
      state.lastDayCalculated = todayStr;
      state.updatedAt = new Date();
      return [{ id: state.id }];
    }

    if (sql.includes('UPDATE monthly_budget_states') && sql.includes('RETURNING "id"')) {
      const [sourceKey, monthKey, cost, todayStr, dailyLimitEnabled, tier, cutoffThresholdPct] =
        values as [string, string, number, string, boolean, number, number];
      const state = rows.find((row) => row.sourceKey === sourceKey && row.monthKey === monthKey);
      if (!state || state.lastDayCalculated !== todayStr) return [];
      if (state.poolUsed + cost > state.poolSize) return [];
      if (dailyLimitEnabled) {
        const cutoffTier = determineTestCutoffTier(
          state.dailyBudget,
          state.dailyUsed,
          cutoffThresholdPct,
        );
        if (cutoffTier != null && tier > cutoffTier) return [];
        if (state.dailyUsed + cost > state.dailyBudget) return [];
      }
      state.poolUsed += cost;
      state.dailyUsed += cost;
      state.updatedAt = new Date();
      return [{ id: state.id }];
    }

    return [];
  });

  const repo = {
    query,
    findOne({ where }: { where: Record<string, unknown> }) {
      return Promise.resolve(
        rows.find((row) =>
          Object.entries(where).every(([key, value]) => (row as never)[key] === value),
        ) ?? null,
      );
    },
    create(x: Partial<MonthlyBudgetState>) {
      return {
        id: `id-${nextId++}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...x,
      } as MonthlyBudgetState;
    },
    save(x: MonthlyBudgetState) {
      const idx = rows.findIndex((row) => row.id === x.id);
      if (idx === -1) {
        rows.push(x);
      } else {
        rows[idx] = x;
      }
      return Promise.resolve(x);
    },
    update(where: Record<string, unknown>, partial: Partial<MonthlyBudgetState>) {
      for (const row of rows) {
        const matches = Object.entries(where).every(
          ([key, value]) => (row as never)[key] === value,
        );
        if (matches) {
          Object.assign(row, partial);
        }
      }
      return Promise.resolve({ affected: rows.length } as never);
    },
  } as unknown as Repository<MonthlyBudgetState>;

  return { repo, rows, query };
}

function determineTestCutoffTier(
  dailyBudget: number,
  dailyUsed: number,
  cutoffThresholdPct: number,
): number | null {
  const remaining = dailyBudget - dailyUsed;
  const threshold = Math.ceil(dailyBudget * (cutoffThresholdPct / 100));
  if (remaining > threshold) return null;
  if (remaining <= 0) return 1;
  if (remaining <= threshold * 0.25) return 2;
  if (remaining <= threshold * 0.5) return 3;
  if (remaining <= threshold * 0.75) return 4;
  return null;
}

function buildFakeActivityRepo(): { repo: Repository<BudgetActivity>; rows: BudgetActivity[] } {
  const rows: BudgetActivity[] = [];
  const repo = {
    create(x: Partial<BudgetActivity>) {
      return { id: `activity-${rows.length + 1}`, createdAt: new Date(), ...x } as BudgetActivity;
    },
    save(x: BudgetActivity) {
      rows.push(x);
      return Promise.resolve(x);
    },
    find: jest.fn().mockResolvedValue(rows),
  } as unknown as Repository<BudgetActivity>;
  return { repo, rows };
}

/**
 * In-memory interpretation of the allocation-admission SQL. It lets tests prove the service
 * receives one admission for each successful atomic upsert without sharing a real database.
 */
function buildFakeOperationStateRepo(): {
  repo: Repository<OperationBudgetState>;
  rows: OperationBudgetState[];
  query: jest.Mock;
} {
  const rows: OperationBudgetState[] = [];
  let nextId = 1;
  const query = jest.fn((sql: string, values: unknown[]) => {
    if (sql.includes('INSERT INTO operation_budget_states')) {
      const [sourceKey, monthKey, operation, capacity, cost] = values as [
        string,
        string,
        OperationBudgetState['operation'],
        number,
        number,
      ];
      const existing = rows.find(
        (row) =>
          row.sourceKey === sourceKey && row.monthKey === monthKey && row.operation === operation,
      );
      if (!existing) {
        if (cost > capacity) return [];
        const created = {
          id: `operation-${nextId++}`,
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
      existing.updatedAt = new Date();
      return [{ id: existing.id }];
    }
    if (sql.includes('UPDATE operation_budget_states')) {
      const [sourceKey, monthKey, operation, cost] = values as [
        string,
        string,
        OperationBudgetState['operation'],
        number,
      ];
      const existing = rows.find(
        (row) =>
          row.sourceKey === sourceKey && row.monthKey === monthKey && row.operation === operation,
      );
      if (existing) existing.used = Math.max(0, existing.used - cost);
      return [];
    }
    return [];
  });
  const repo = {
    query,
    find: jest.fn().mockResolvedValue(rows),
  } as unknown as Repository<OperationBudgetState>;
  return { repo, rows, query };
}

/** Fake config service with ADR-0009 defaults. */
function buildFakeConfig(overrides?: Partial<AppConfig>) {
  const defaults: AppConfig = {
    nodeEnv: 'test',
    port: 3000,
    databaseUrl: '',
    autoRiaApiKey: 'key',
    autoRiaAiEnabled: false,
    autoRiaAiApiKey: '',
    autoRiaAiUserId: '',
    autoRiaAiPolicyKey: 'ai-shadow-v1',
    autoRiaAiSampleRate: 0,
    autoRiaAiMonthlyAllocation: 0,
    autoRiaAiTimeoutMs: 5000,
    telegramBotToken: 'token',
    telegramAdminChatIds: [],
    nbuRateUrl: 'url',
    rateBudgetPerHour: 30,
    rateBudgetPoolPerMonth: 20000,
    rateBudgetReservePct: 15,
    rateBudgetCutoffThresholdPct: 10,
    defaultMinDealScore: 0.63,
    defaultConfidenceMinSamples: 10,
    mileageAnnualK: 15,
    mileagePer10kPct: 2,
    mileageMaxAdjPct: 20,
    logSourceRequests: false,
    logLevel: 'debug',
    calibrationMode: 'propose',
    calibrationMinVolume: 5,
    calibrationMaxVolume: 20,
    calibrationMinPrecision: 0.7,
    dealReminderDays: 30,
  };

  const config = { ...defaults, ...overrides };
  return {
    get: (key: keyof AppConfig) => config[key],
  } as unknown as ConfigService<AppConfig, true>;
}

describe('RateBudgetService (ADR-0009)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Monthly budget initialization', () => {
    it('lazily initializes monthly pool state on first tryConsume()', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-07-15T10:00:00Z'));

      const { repo: windowRepo } = buildFakeWindowRepo();
      const { repo: stateRepo, rows: stateRows } = buildFakeStateRepo();
      const config = buildFakeConfig();

      const service = new RateBudgetService(config, windowRepo, stateRepo, fakeLogger as never);

      await service.tryConsume('auto-ria', 1, 1);

      expect(stateRows.length).toBe(1);
      expect(stateRows[0].sourceKey).toBe('auto-ria');
      expect(stateRows[0].monthKey).toBe('202607');
      expect(stateRows[0].poolSize).toBe(20000);
      expect(stateRows[0].reserveAmount).toBe(3000); // 15% of 20,000

      jest.useRealTimers();
    });

    it('reuses existing monthly state on subsequent calls', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-07-15T10:00:00Z'));

      const { repo: windowRepo } = buildFakeWindowRepo();
      const { repo: stateRepo, rows: stateRows } = buildFakeStateRepo();
      const config = buildFakeConfig();

      const service = new RateBudgetService(config, windowRepo, stateRepo, fakeLogger as never);

      await service.tryConsume('auto-ria', 1, 1);
      const initialCount = stateRows.length;

      await service.tryConsume('auto-ria', 1, 1);

      expect(stateRows.length).toBe(initialCount); // No new row created

      jest.useRealTimers();
    });
  });

  describe('Daily budget calculation', () => {
    it('calculates daily budget as (pool - reserve) / days_remaining', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-07-15T10:00:00Z'));

      const { repo: windowRepo } = buildFakeWindowRepo();
      const { repo: stateRepo, rows: stateRows } = buildFakeStateRepo();
      const config = buildFakeConfig({
        rateBudgetPoolPerMonth: 20000,
        rateBudgetReservePct: 15,
      });

      const service = new RateBudgetService(config, windowRepo, stateRepo, fakeLogger as never);

      await service.tryConsume('auto-ria', 1, 1);

      const state = stateRows[0];
      // (20000 - 3000) / 17 = 1000
      expect(state.dailyBudget).toBe(1000);
      expect(state.lastDayCalculated).toBe('2026-07-15');

      jest.useRealTimers();
    });

    it('resets daily usage when date changes', async () => {
      jest.useFakeTimers();

      const { repo: windowRepo } = buildFakeWindowRepo();
      const { repo: stateRepo, rows: stateRows } = buildFakeStateRepo();
      const config = buildFakeConfig();

      const service = new RateBudgetService(config, windowRepo, stateRepo, fakeLogger as never);

      // First call on July 15
      jest.setSystemTime(new Date('2026-07-15T10:00:00Z'));
      await service.tryConsume('auto-ria', 1, 1);
      expect(stateRows[0].lastDayCalculated).toBe('2026-07-15');

      // Second call on July 16 (simulating date change)
      jest.setSystemTime(new Date('2026-07-16T10:00:00Z'));
      await service.tryConsume('auto-ria', 1, 1);

      expect(stateRows[0].lastDayCalculated).toBe('2026-07-16');
      expect(stateRows[0].dailyUsed).toBe(1); // Reset, then admit today's request

      jest.useRealTimers();
    });

    it('holds reserve until 3 days before month end', async () => {
      jest.useFakeTimers();

      const { repo: windowRepo } = buildFakeWindowRepo();
      const { repo: stateRepo, rows: stateRows } = buildFakeStateRepo();
      const config = buildFakeConfig();

      const service = new RateBudgetService(config, windowRepo, stateRepo, fakeLogger as never);

      // July 28 (3 days before July 31 — reserve should be held)
      jest.setSystemTime(new Date('2026-07-28T10:00:00Z'));
      await service.tryConsume('auto-ria', 1, 1);

      let state = stateRows[0];
      // (20000 - 3000) / 4 = 4250 (reserve held)
      expect(state.dailyBudget).toBe(4250);

      // Now advance to July 29 (reserve released, 3 days before end)
      jest.setSystemTime(new Date('2026-07-29T00:00:01Z'));

      stateRows.length = 0; // Clear for clean state
      await service.tryConsume('auto-ria', 1, 1);

      state = stateRows[0];
      // (20000 - 0) / 3 = 6666 (reserve released, 3 days remaining including 29,30,31)
      expect(state.dailyBudget).toBe(6666);

      jest.useRealTimers();
    });
  });

  describe('Tier cutoff logic', () => {
    it('allows all tiers when budget is comfortable', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-07-15T10:00:00Z'));

      const { repo: windowRepo } = buildFakeWindowRepo();
      const { repo: stateRepo } = buildFakeStateRepo();
      const config = buildFakeConfig({ rateBudgetCutoffThresholdPct: 10 });

      const service = new RateBudgetService(config, windowRepo, stateRepo, fakeLogger as never);

      // Tier-1 should succeed
      const allowed = await service.tryConsume('auto-ria', 1, 1);
      expect(allowed).toBe(true);

      // Tier-5 should also succeed
      const allowedTier5 = await service.tryConsume('auto-ria', 1, 5);
      expect(allowedTier5).toBe(true);

      jest.useRealTimers();
    });

    it('denies tier-5 when remaining budget < threshold', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-07-15T10:00:00Z'));

      const { repo: windowRepo } = buildFakeWindowRepo();
      const { repo: stateRepo, rows: stateRows } = buildFakeStateRepo();
      const config = buildFakeConfig({
        rateBudgetCutoffThresholdPct: 10,
      });

      const service = new RateBudgetService(config, windowRepo, stateRepo, fakeLogger as never);

      // Create a state with minimal daily budget to trigger cutoff
      const state = stateRepo.create({
        sourceKey: 'auto-ria',
        monthKey: '202607',
        poolSize: 1000,
        poolUsed: 0,
        reserveAmount: 0,
        reserveReleasesAt: new Date('2026-07-29'),
        dailyBudget: 100, // Very small daily budget
        dailyUsed: 95, // 95 out of 100, only 5 remaining
        lastDayCalculated: '2026-07-15',
      });
      stateRows.push(state);

      // Threshold is 10% of 100 = 10, remaining is 5 (< 10)
      // Tier-5 should be denied
      const deniedTier5 = await service.tryConsume('auto-ria', 1, 5);
      expect(deniedTier5).toBe(false);

      // But tier-1 should still be allowed
      const allowedTier1 = await service.tryConsume('auto-ria', 1, 1);
      expect(allowedTier1).toBe(true);

      jest.useRealTimers();
    });

    it('daily-budget exhaustion overrides tier priority (tier-1 still denied)', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-07-15T10:00:00Z'));

      const { repo: windowRepo } = buildFakeWindowRepo();
      const { repo: stateRepo, rows: stateRows } = buildFakeStateRepo();
      const config = buildFakeConfig();

      const service = new RateBudgetService(config, windowRepo, stateRepo, fakeLogger as never);

      // Create a state with zero remaining budget
      const state = stateRepo.create({
        sourceKey: 'auto-ria',
        monthKey: '202607',
        poolSize: 1000,
        poolUsed: 0,
        reserveAmount: 0,
        reserveReleasesAt: new Date('2026-07-29'),
        dailyBudget: 100,
        dailyUsed: 100, // Fully consumed
        lastDayCalculated: '2026-07-15',
      });
      stateRows.push(state);

      // Tier-1 should still be allowed (it's never denied by cutoff logic,
      // but will fail the daily budget check)
      const allowed = await service.tryConsume('auto-ria', 1, 1);
      expect(allowed).toBe(false); // Fails due to daily budget exhaustion, not tier cutoff

      jest.useRealTimers();
    });
  });

  describe('Pool exhaustion', () => {
    it('denies consumption when monthly pool is exhausted', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-07-15T10:00:00Z'));

      const { repo: windowRepo } = buildFakeWindowRepo();
      const { repo: stateRepo, rows: stateRows } = buildFakeStateRepo();
      const config = buildFakeConfig();

      const service = new RateBudgetService(config, windowRepo, stateRepo, fakeLogger as never);

      // Create a state with pool exhausted
      const state = stateRepo.create({
        sourceKey: 'auto-ria',
        monthKey: '202607',
        poolSize: 1000,
        poolUsed: 1000, // Fully consumed
        reserveAmount: 0,
        reserveReleasesAt: new Date('2026-07-29'),
        dailyBudget: 100,
        dailyUsed: 0,
        lastDayCalculated: '2026-07-15',
      });
      stateRows.push(state);

      const allowed = await service.tryConsume('auto-ria', 1, 1);
      expect(allowed).toBe(false);
      expect(fakeLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ poolUsed: 1000, poolSize: 1000 }),
        'Monthly pool exhausted',
      );

      jest.useRealTimers();
    });
  });

  describe('Atomic shared-pool admission', () => {
    it('does not overrun the monthly or daily source capacity when concurrent callers pass preflight', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-15T10:00:00Z'));
      const { repo: windowRepo } = buildFakeWindowRepo();
      const { repo: stateRepo, rows: stateRows, query: sourceStateQuery } = buildFakeStateRepo();
      const { repo: activityRepo, rows: activityRows } = buildFakeActivityRepo();
      const service = new RateBudgetService(
        buildFakeConfig(),
        windowRepo,
        stateRepo,
        fakeLogger as never,
        activityRepo,
      );
      stateRows.push(
        stateRepo.create({
          sourceKey: 'monthly-race',
          monthKey: '202607',
          poolSize: 2,
          poolUsed: 0,
          reserveAmount: 0,
          reserveReleasesAt: new Date('2026-07-29T00:00:00Z'),
          dailyBudget: 10,
          dailyUsed: 0,
          lastDayCalculated: '2026-07-15',
        }),
        stateRepo.create({
          sourceKey: 'daily-race',
          monthKey: '202607',
          poolSize: 10,
          poolUsed: 0,
          reserveAmount: 0,
          reserveReleasesAt: new Date('2026-07-29T00:00:00Z'),
          dailyBudget: 2,
          dailyUsed: 0,
          lastDayCalculated: '2026-07-15',
        }),
      );

      const results = await Promise.all([
        service.tryConsume('monthly-race', 1, 1, { operation: 'search' }),
        service.tryConsume('monthly-race', 1, 1, { operation: 'search' }),
        service.tryConsume('monthly-race', 1, 1, { operation: 'search' }),
        service.tryConsume('daily-race', 1, 1, { operation: 'search' }),
        service.tryConsume('daily-race', 1, 1, { operation: 'search' }),
        service.tryConsume('daily-race', 1, 1, { operation: 'search' }),
      ]);

      expect(results).toEqual([true, true, false, true, true, false]);
      expect(stateRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sourceKey: 'monthly-race', poolUsed: 2, dailyUsed: 2 }),
          expect.objectContaining({ sourceKey: 'daily-race', poolUsed: 2, dailyUsed: 2 }),
        ]),
      );
      expect(activityRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceKey: 'monthly-race',
            outcome: 'denied',
            reason: 'monthly_exhausted',
          }),
          expect.objectContaining({
            sourceKey: 'daily-race',
            outcome: 'denied',
            reason: 'daily_exhausted',
          }),
        ]),
      );
      expect(sourceStateQuery).toHaveBeenCalledWith(
        expect.stringContaining('"poolUsed" + $3 <= "poolSize"'),
        expect.any(Array),
      );
      expect(sourceStateQuery).toHaveBeenCalledWith(
        expect.stringContaining('"dailyUsed" + $3 <= "dailyBudget"'),
        expect.any(Array),
      );
      jest.useRealTimers();
    });

    it('rechecks the priority cutoff under the atomic update before admitting a stale low-priority caller', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-15T10:00:00Z'));
      const { repo: windowRepo } = buildFakeWindowRepo();
      const { repo: stateRepo, rows: stateRows } = buildFakeStateRepo();
      const { repo: activityRepo, rows: activityRows } = buildFakeActivityRepo();
      const service = new RateBudgetService(
        buildFakeConfig({ rateBudgetCutoffThresholdPct: 10 }),
        windowRepo,
        stateRepo,
        fakeLogger as never,
        activityRepo,
      );
      stateRows.push(
        stateRepo.create({
          sourceKey: 'cutoff-race',
          monthKey: '202607',
          poolSize: 1000,
          poolUsed: 89,
          reserveAmount: 0,
          reserveReleasesAt: new Date('2026-07-29T00:00:00Z'),
          dailyBudget: 100,
          dailyUsed: 89,
          lastDayCalculated: '2026-07-15',
        }),
      );

      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          service.tryConsume('cutoff-race', 1, 5, { operation: 'cohort_average' }),
        ),
      );

      expect(results).toEqual([true, true, true, true, false]);
      expect(stateRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sourceKey: 'cutoff-race', poolUsed: 93, dailyUsed: 93 }),
        ]),
      );
      expect(activityRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceKey: 'cutoff-race',
            operation: 'cohort_average',
            outcome: 'denied',
            reason: 'tier_cutoff',
          }),
        ]),
      );
      jest.useRealTimers();
    });
  });

  describe('HTTP 429 back-off', () => {
    it('denies tryConsume() after markExhausted(), then allows again after the cooldown elapses', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-07-15T10:00:00Z'));

      const { repo: windowRepo } = buildFakeWindowRepo();
      const { repo: stateRepo } = buildFakeStateRepo();
      const config = buildFakeConfig();

      const service = new RateBudgetService(config, windowRepo, stateRepo, fakeLogger as never);

      await service.markExhausted('auto-ria');

      // Immediately after being marked exhausted, consumption is denied.
      const deniedDuringCooldown = await service.tryConsume('auto-ria', 1, 1);
      expect(deniedDuringCooldown).toBe(false);

      // Advance past the 5-minute cooldown.
      jest.setSystemTime(new Date('2026-07-15T10:05:01Z'));
      const allowedAfterCooldown = await service.tryConsume('auto-ria', 1, 1);
      expect(allowedAfterCooldown).toBe(true);

      jest.useRealTimers();
    });
  });

  it('persists attributed allowed and denied attempts for the audit ledger', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-15T10:00:00Z'));
    const { repo: windowRepo } = buildFakeWindowRepo();
    const { repo: stateRepo, rows: stateRows } = buildFakeStateRepo();
    const { repo: activityRepo, rows: activityRows } = buildFakeActivityRepo();
    const service = new RateBudgetService(
      buildFakeConfig(),
      windowRepo,
      stateRepo,
      fakeLogger as never,
      activityRepo,
    );
    await service.tryConsume('auto-ria', 1, 3, {
      operation: 'search',
      profileId: 'p-1',
      profileName: 'Kyiv',
    });
    stateRows[0].dailyUsed = stateRows[0].dailyBudget;
    await service.tryConsume('auto-ria', 1, 5, { operation: 'cohort_average' });

    expect(activityRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcome: 'allowed',
          operation: 'search',
          profileName: 'Kyiv',
          priorityTier: 3,
        }),
        expect.objectContaining({
          outcome: 'denied',
          operation: 'cohort_average',
          reason: 'tier_cutoff',
        }),
      ]),
    );
    jest.useRealTimers();
  });
  it('bypasses daily enforcement while the daily limit is disabled', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00Z'));
    const { repo: windowRepo } = buildFakeWindowRepo();
    const { repo: stateRepo } = buildFakeStateRepo();
    const { repo: activityRepo, rows: activityRows } = buildFakeActivityRepo();
    const sourceControl = { isDailyLimitEnabled: jest.fn().mockResolvedValue(false) };
    const service = new RateBudgetService(
      buildFakeConfig(),
      windowRepo,
      stateRepo,
      fakeLogger as never,
      activityRepo,
      sourceControl as never,
    );

    const allowed = await service.tryConsume('auto-ria', 1, 1, { operation: 'search' });

    expect(allowed).toBe(true);
    expect(sourceControl.isDailyLimitEnabled.mock.calls).toContainEqual(['auto-ria']);
    expect(activityRows).toEqual(
      expect.arrayContaining([expect.objectContaining({ outcome: 'allowed' })]),
    );
    jest.useRealTimers();
  });

  describe('valuation_ai operation allocation', () => {
    it('requires an explicit positive allocation and records a non-charged denial', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00Z'));
      const { repo: windowRepo } = buildFakeWindowRepo();
      const { repo: stateRepo } = buildFakeStateRepo();
      const { repo: activityRepo, rows: activityRows } = buildFakeActivityRepo();
      const { repo: operationStateRepo, rows: operationRows } = buildFakeOperationStateRepo();
      const service = new RateBudgetService(
        buildFakeConfig(),
        windowRepo,
        stateRepo,
        fakeLogger as never,
        activityRepo,
        undefined,
        operationStateRepo,
      );

      const allowed = await service.tryConsume('auto-ria', 1, 5, {
        operation: 'valuation_ai',
        requestFingerprint: 'ai-shadow-request',
      });

      expect(allowed).toBe(false);
      expect(operationRows).toHaveLength(0);
      expect(activityRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'valuation_ai',
            reason: 'operation_allocation_exhausted',
            outcome: 'denied',
            requestFingerprint: 'ai-shadow-request',
            chargeStatus: 'not_charged',
          }),
        ]),
      );
      jest.useRealTimers();
    });

    it('atomically caps retries and leaves legacy operations outside the allocation gate', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00Z'));
      const { repo: windowRepo } = buildFakeWindowRepo();
      const { repo: stateRepo, rows: stateRows } = buildFakeStateRepo();
      const { repo: activityRepo, rows: activityRows } = buildFakeActivityRepo();
      const {
        repo: operationStateRepo,
        rows: operationRows,
        query: operationStateQuery,
      } = buildFakeOperationStateRepo();
      const service = new RateBudgetService(
        buildFakeConfig(),
        windowRepo,
        stateRepo,
        fakeLogger as never,
        activityRepo,
        undefined,
        operationStateRepo,
      );
      stateRows.push(
        stateRepo.create({
          sourceKey: 'auto-ria',
          monthKey: '202607',
          poolSize: 20000,
          poolUsed: 0,
          reserveAmount: 3000,
          reserveReleasesAt: new Date('2026-07-29T00:00:00Z'),
          dailyBudget: 1000,
          dailyUsed: 0,
          lastDayCalculated: '2026-07-15',
        }),
      );

      const firstAttempt = service.tryConsume('auto-ria', 1, 5, {
        operation: 'valuation_ai',
        operationMonthlyAllocation: 2,
        requestFingerprint: 'retry-fingerprint',
      });
      const retryAttempt = service.tryConsume('auto-ria', 1, 5, {
        operation: 'valuation_ai',
        operationMonthlyAllocation: 2,
        requestFingerprint: 'retry-fingerprint',
      });
      const overAllocationAttempt = service.tryConsume('auto-ria', 1, 5, {
        operation: 'valuation_ai',
        operationMonthlyAllocation: 2,
        requestFingerprint: 'retry-fingerprint',
      });

      await expect(
        Promise.all([firstAttempt, retryAttempt, overAllocationAttempt]),
      ).resolves.toEqual([true, true, false]);
      expect(operationRows).toEqual([
        expect.objectContaining({
          sourceKey: 'auto-ria',
          monthKey: '202607',
          operation: 'valuation_ai',
          capacity: 2,
          used: 2,
        }),
      ]);
      expect(operationStateQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT ("sourceKey", "monthKey", "operation")'),
        expect.any(Array),
      );
      expect(activityRows.filter((row) => row.outcome === 'allowed')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'valuation_ai',
            requestFingerprint: 'retry-fingerprint',
            chargeStatus: 'unknown',
          }),
        ]),
      );
      expect(activityRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'valuation_ai',
            outcome: 'denied',
            reason: 'operation_allocation_exhausted',
            chargeStatus: 'not_charged',
          }),
        ]),
      );

      await expect(
        service.tryConsume('auto-ria', 1, 1, {
          operation: 'search',
          operationMonthlyAllocation: 0,
        }),
      ).resolves.toBe(true);
      expect(operationRows).toHaveLength(1);
      jest.useRealTimers();
    });

    it('does not reserve provider allocation during a source cooldown', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00Z'));
      const { repo: windowRepo } = buildFakeWindowRepo();
      const { repo: stateRepo } = buildFakeStateRepo();
      const { repo: activityRepo, rows: activityRows } = buildFakeActivityRepo();
      const { repo: operationStateRepo, rows: operationRows } = buildFakeOperationStateRepo();
      const service = new RateBudgetService(
        buildFakeConfig(),
        windowRepo,
        stateRepo,
        fakeLogger as never,
        activityRepo,
        undefined,
        operationStateRepo,
      );

      await service.markExhausted('auto-ria');
      await expect(
        service.tryConsume('auto-ria', 1, 5, {
          operation: 'valuation_ai',
          operationMonthlyAllocation: 2,
          requestFingerprint: 'cooldown-fingerprint',
        }),
      ).resolves.toBe(false);

      expect(operationRows).toHaveLength(0);
      expect(activityRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'valuation_ai',
            outcome: 'denied',
            reason: 'cooldown',
            chargeStatus: 'not_charged',
          }),
        ]),
      );
      jest.useRealTimers();
    });

    it('reports the durable valuation allocation separately from legacy pool allocations', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00Z'));
      const { repo: windowRepo } = buildFakeWindowRepo();
      const { repo: stateRepo, rows: stateRows } = buildFakeStateRepo();
      const { repo: activityRepo, rows: activityRows } = buildFakeActivityRepo();
      const { repo: operationStateRepo, rows: operationRows } = buildFakeOperationStateRepo();
      const service = new RateBudgetService(
        buildFakeConfig(),
        windowRepo,
        stateRepo,
        fakeLogger as never,
        activityRepo,
        undefined,
        operationStateRepo,
      );
      stateRows.push(
        stateRepo.create({
          sourceKey: 'auto-ria',
          monthKey: '202607',
          poolSize: 20000,
          poolUsed: 1,
          reserveAmount: 3000,
          reserveReleasesAt: new Date('2026-07-29T00:00:00Z'),
          dailyBudget: 1000,
          dailyUsed: 1,
          lastDayCalculated: '2026-07-15',
        }),
      );
      operationRows.push({
        id: 'operation-1',
        sourceKey: 'auto-ria',
        monthKey: '202607',
        operation: 'valuation_ai',
        capacity: 7,
        used: 1,
        updatedAt: new Date(),
      });
      activityRows.push(
        activityRepo.create({
          sourceKey: 'auto-ria',
          monthKey: '202607',
          operation: 'valuation_ai',
          priorityTier: 5,
          cost: 1,
          outcome: 'allowed',
          reason: 'allowed',
          chargeStatus: 'unknown',
        }),
      );

      const report = await service.report('auto-ria', new Date('2026-07-15T12:00:00Z'));

      expect(report?.operationActual).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'valuation_ai',
            actual: 1,
            allocation: 7,
          }),
        ]),
      );
      jest.useRealTimers();
    });
  });
});
