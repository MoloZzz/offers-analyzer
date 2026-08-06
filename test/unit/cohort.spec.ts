import { Currency } from '../../src/common/types/money';
import { ListingDetail, ListingSource } from '../../src/modules/sources/ports/listing-source.port';
import { BenchmarkCacheService } from '../../src/modules/valuation/benchmark-cache.service';
import { cohortCandidates, MILEAGE_BAND_K, resolveBenchmark } from '../../src/modules/valuation/cohort';

function detail(overrides: Partial<ListingDetail> = {}): ListingDetail {
  return {
    externalId: '1',
    make: 'BMW',
    model: '3 Series',
    markId: 9,
    modelId: 3219,
    year: 2017,
    mileage: 120,
    sellerType: 'private',
    hasVinReport: true,
    url: 'https://auto.ria.com/uk/auto_1.html',
    price: { amount: 12000, currency: Currency.USD },
    risk: {
      damaged: false,
      salvage: false,
      unclearCustoms: false,
      confiscated: false,
      underCredit: false,
      abroad: false,
      vinChecked: false,
    },
    ...overrides,
  };
}

describe('cohortCandidates (mileage-aware, widest-data fallback)', () => {
  it('puts the mileage-banded cohort first, then year±1, then make+model', () => {
    const [banded, yearRange, model] = cohortCandidates(detail({ year: 2017, mileage: 120 }));

    expect(banded).toEqual({
      markId: 9,
      modelId: 3219,
      yearFrom: 2016,
      yearTo: 2018,
      mileageFrom: 120 - MILEAGE_BAND_K,
      mileageTo: 120 + MILEAGE_BAND_K,
    });
    expect(yearRange).toEqual({ markId: 9, modelId: 3219, yearFrom: 2016, yearTo: 2018 });
    expect(model).toEqual({ markId: 9, modelId: 3219 });
  });

  it('floors the lower mileage bound at 0 for low-mileage cars', () => {
    const [banded] = cohortCandidates(detail({ mileage: 10 }));
    expect(banded.mileageFrom).toBe(0);
    expect(banded.mileageTo).toBe(10 + MILEAGE_BAND_K);
  });

  it('omits the banded cohort when mileage is unknown', () => {
    const candidates = cohortCandidates(detail({ mileage: undefined }));
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => c.mileageFrom === undefined)).toBe(true);
  });

  it('never constrains by city (city starves the sample)', () => {
    const candidates = cohortCandidates(detail({ cityId: 287 }));
    expect(candidates.every((c) => c.cityId === undefined)).toBe(true);
  });
});

describe('cohortCandidates (drivetrain band as a trim/generation proxy)', () => {
  const banded = detail({ year: 2017, mileage: undefined, gearboxId: 2, fuelId: 1 });

  it('inserts exact-year then year±1 drivetrain cohorts above the plain year range', () => {
    expect(cohortCandidates(banded)).toEqual([
      { markId: 9, modelId: 3219, gearboxId: 2, fuelId: 1, yearFrom: 2017, yearTo: 2017 },
      { markId: 9, modelId: 3219, gearboxId: 2, fuelId: 1, yearFrom: 2016, yearTo: 2018 },
      { markId: 9, modelId: 3219, yearFrom: 2016, yearTo: 2018 },
      { markId: 9, modelId: 3219 },
    ]);
  });

  it('bands on whichever of gearbox and fuel the source gave us', () => {
    const [exact] = cohortCandidates(detail({ mileage: undefined, gearboxId: 2, fuelId: undefined }));
    expect(exact).toEqual({ markId: 9, modelId: 3219, gearboxId: 2, yearFrom: 2017, yearTo: 2017 });
  });

  it('adds no band when neither id is known — a bandless tier would duplicate the one below it', () => {
    const candidates = cohortCandidates(detail({ mileage: undefined }));
    expect(candidates).toHaveLength(2);
  });

  it('rejects the 0 missing-value sentinel rather than querying an id of zero', () => {
    const candidates = cohortCandidates(detail({ mileage: undefined, gearboxId: 0, fuelId: 0 }));
    expect(candidates).toHaveLength(2);
  });

  it('skips the band entirely for a sentinel year (no requests on a nonsense range)', () => {
    const candidates = cohortCandidates(detail({ year: 0, mileage: undefined, gearboxId: 2, fuelId: 1 }));
    expect(candidates).toHaveLength(2);
  });
});

describe('resolveBenchmark (budget-stabilized hot path)', () => {
  it('does not load a mileage-banded cohort from the live source', async () => {
    const averagePrice = jest.fn().mockResolvedValue({
      value: { amount: 12000, currency: Currency.USD },
      sampleSize: 20,
    });
    const source = {
      averagePrice,
    } as unknown as ListingSource;
    const cache = {
      getOrLoad: jest.fn((_key: string, _cohort: unknown, loader: () => Promise<unknown>) => loader()),
    } as unknown as BenchmarkCacheService;

    const result = await resolveBenchmark(source, cache, detail());

    expect(result?.mileageAware).toBe(false);
    expect((cache.getOrLoad as jest.Mock).mock.calls[0][1]).toEqual({
      markId: 9,
      modelId: 3219,
      yearFrom: 2016,
      yearTo: 2018,
    });
    expect(averagePrice).toHaveBeenCalledTimes(1);
  });

  it('prefers the drivetrain-banded cohort and names its tier', async () => {
    const source = {
      averagePrice: jest.fn().mockResolvedValue({
        value: { amount: 12000, currency: Currency.USD },
        sampleSize: 40,
      }),
    } as unknown as ListingSource;
    const cache = {
      getOrLoad: jest.fn((_key: string, _cohort: unknown, loader: () => Promise<unknown>) => loader()),
    } as unknown as BenchmarkCacheService;

    const result = await resolveBenchmark(source, cache, detail({ gearboxId: 2, fuelId: 1 }));

    expect(result?.cohort.tier).toBe('make_model_year_exact_trim');
    expect(result?.cohort.key).toContain('gear:2|fuel:1');
    expect((cache.getOrLoad as jest.Mock).mock.calls[0][1]).toEqual({
      markId: 9,
      modelId: 3219,
      gearboxId: 2,
      fuelId: 1,
      yearFrom: 2017,
      yearTo: 2017,
    });
  });

  it('falls through a thin banded cohort to the wide year range', async () => {
    const averagePrice = jest
      .fn()
      // exact year + band, then year±1 + band: both below MIN_USEFUL_SAMPLES
      .mockResolvedValueOnce({ value: { amount: 12500, currency: Currency.USD }, sampleSize: 2 })
      .mockResolvedValueOnce({ value: { amount: 12400, currency: Currency.USD }, sampleSize: 9 })
      .mockResolvedValue({ value: { amount: 12000, currency: Currency.USD }, sampleSize: 380 });
    const source = { averagePrice } as unknown as ListingSource;
    const cache = {
      getOrLoad: jest.fn((_key: string, _cohort: unknown, loader: () => Promise<unknown>) => loader()),
    } as unknown as BenchmarkCacheService;

    const result = await resolveBenchmark(source, cache, detail({ gearboxId: 2, fuelId: 1 }));

    expect(result?.value.amount).toBe(12000);
    expect(result?.cohort.tier).toBe('make_model_year');
    expect(averagePrice).toHaveBeenCalledTimes(3);
  });
});
