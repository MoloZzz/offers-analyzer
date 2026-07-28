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
