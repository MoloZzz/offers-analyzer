import { Currency } from '../../src/common/types/money';
import { BenchmarkCacheService } from '../../src/modules/valuation/benchmark-cache.service';

describe('BenchmarkCacheService estimator version', () => {
  it('misses an old estimator cache but keeps snapshot cohort identity stable', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((input) => input),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const snapshots = {
      create: jest.fn((input) => input),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const service = new BenchmarkCacheService(repo as never, snapshots as never);
    const cohort = { markId: 9, modelId: 3219, yearFrom: 2003, yearTo: 2005 };

    await service.getOrLoad('auto-ria', cohort, () => Promise.resolve({
      value: { amount: 3600, currency: Currency.USD },
      sampleSize: 513,
    }));

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { sourceKey: 'auto-ria', cohortKey: 'median-v2|9:3219::2003:2005::' },
    });
    expect(snapshots.create).toHaveBeenCalledWith(
      expect.objectContaining({ cohortKey: '9:3219::2003:2005::' }),
    );
  });
});

describe('BenchmarkCacheService.cohortKey', () => {
  it('leaves a bandless cohort key byte-identical to the stored history', () => {
    // SPEC-004 joins average_price_snapshots and listing_disappearances on this exact string.
    expect(BenchmarkCacheService.cohortKey({ markId: 9, modelId: 3219, yearFrom: 2003, yearTo: 2005 }))
      .toBe('9:3219::2003:2005::');
  });

  it('appends the drivetrain band so a banded cohort is a distinct cache entry', () => {
    expect(
      BenchmarkCacheService.cohortKey({
        markId: 9,
        modelId: 3219,
        yearFrom: 2017,
        yearTo: 2017,
        gearboxId: 2,
        fuelId: 1,
      }),
    ).toBe('9:3219::2017:2017:::gear=2:fuel=1');
  });

  it('distinguishes gearbox-only from fuel-only bands', () => {
    const base = { markId: 9, modelId: 3219 };
    expect(BenchmarkCacheService.cohortKey({ ...base, gearboxId: 2 })).not.toBe(
      BenchmarkCacheService.cohortKey({ ...base, fuelId: 2 }),
    );
  });
});
