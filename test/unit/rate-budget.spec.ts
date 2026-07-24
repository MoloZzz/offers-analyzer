import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { AppConfig } from '../../src/common/config/configuration';
import { MonthlyBudgetState } from '../../src/modules/scheduling/entities/monthly-budget-state.entity';
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
          Object.entries(where).every(([key, value]) => (row as never)[key] === value)
        ) ?? null
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
function buildFakeStateRepo(): { repo: Repository<MonthlyBudgetState>; rows: MonthlyBudgetState[] } {
  const rows: MonthlyBudgetState[] = [];
  let nextId = 1;

  const repo = {
    query: jest.fn(),
    findOne({ where }: { where: Record<string, unknown> }) {
      return Promise.resolve(
        rows.find((row) =>
          Object.entries(where).every(([key, value]) => (row as never)[key] === value)
        ) ?? null
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
        const matches = Object.entries(where).every(([key, value]) => (row as never)[key] === value);
        if (matches) {
          Object.assign(row, partial);
        }
      }
      return Promise.resolve({ affected: rows.length } as never);
    },
  } as unknown as Repository<MonthlyBudgetState>;

  return { repo, rows };
}

/** Fake config service with ADR-0009 defaults. */
function buildFakeConfig(overrides?: Partial<AppConfig>) {
  const defaults: AppConfig = {
    nodeEnv: 'test',
    port: 3000,
    databaseUrl: '',
    autoRiaApiKey: 'key',
    telegramBotToken: 'token',
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

      (stateRepo.query as jest.Mock).mockResolvedValue([]);

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

      (stateRepo.query as jest.Mock).mockResolvedValue([]);

      await service.tryConsume('auto-ria', 1, 1);
      const initialCount = stateRows.length;

      (stateRepo.query as jest.Mock).mockResolvedValue([]);
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

      (stateRepo.query as jest.Mock).mockResolvedValue([]);

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
      (stateRepo.query as jest.Mock).mockResolvedValue([]);

      await service.tryConsume('auto-ria', 1, 1);
      expect(stateRows[0].lastDayCalculated).toBe('2026-07-15');

      // Second call on July 16 (simulating date change)
      jest.setSystemTime(new Date('2026-07-16T10:00:00Z'));
      (stateRepo.query as jest.Mock).mockResolvedValue([]);

      await service.tryConsume('auto-ria', 1, 1);

      expect(stateRows[0].lastDayCalculated).toBe('2026-07-16');
      expect(stateRows[0].dailyUsed).toBe(0); // Reset

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
      (stateRepo.query as jest.Mock).mockResolvedValue([]);

      await service.tryConsume('auto-ria', 1, 1);

      let state = stateRows[0];
      // (20000 - 3000) / 4 = 4250 (reserve held)
      expect(state.dailyBudget).toBe(4250);

      // Now advance to July 29 (reserve released, 3 days before end)
      jest.setSystemTime(new Date('2026-07-29T00:00:01Z'));

      stateRows.length = 0; // Clear for clean state
      (stateRepo.query as jest.Mock).mockResolvedValue([]);

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

      (stateRepo.query as jest.Mock).mockResolvedValue([]);

      // Tier-1 should succeed
      const allowed = await service.tryConsume('auto-ria', 1, 1);
      expect(allowed).toBe(true);

      // Tier-5 should also succeed
      (stateRepo.query as jest.Mock).mockResolvedValue([]);
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

      (stateRepo.query as jest.Mock).mockResolvedValue([]);

      // Threshold is 10% of 100 = 10, remaining is 5 (< 10)
      // Tier-5 should be denied
      const deniedTier5 = await service.tryConsume('auto-ria', 1, 5);
      expect(deniedTier5).toBe(false);

      // But tier-1 should still be allowed
      (stateRepo.query as jest.Mock).mockResolvedValue([]);
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

      (stateRepo.query as jest.Mock).mockResolvedValue([]);

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

      (stateRepo.query as jest.Mock).mockResolvedValue([]);

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

      (stateRepo.query as jest.Mock).mockResolvedValue([]);

      const allowed = await service.tryConsume('auto-ria', 1, 1);
      expect(allowed).toBe(false);
      expect(fakeLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ poolUsed: 1000, poolSize: 1000 }),
        'Monthly pool exhausted'
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

      (stateRepo.query as jest.Mock).mockResolvedValue([]);

      await service.markExhausted('auto-ria');

      // Immediately after being marked exhausted, consumption is denied.
      const deniedDuringCooldown = await service.tryConsume('auto-ria', 1, 1);
      expect(deniedDuringCooldown).toBe(false);

      // Advance past the 5-minute cooldown.
      jest.setSystemTime(new Date('2026-07-15T10:05:01Z'));
      (stateRepo.query as jest.Mock).mockResolvedValue([]);

      const allowedAfterCooldown = await service.tryConsume('auto-ria', 1, 1);
      expect(allowedAfterCooldown).toBe(true);

      jest.useRealTimers();
    });
  });
});
