import { Currency } from '../../src/common/types/money';
import {
  CohortListing,
  CoverageListing,
  RelistCandidate,
  cohortKeyForListing,
  domDays,
  isRelistMatch,
  isSearchEligible,
  priceCutStats,
  profileCovers,
  RELIST_MILEAGE_TOLERANCE_K,
} from '../../src/modules/listings/disappearance';
import { SearchProfile } from '../../src/modules/profiles/entities/search-profile.entity';
import { SourceSearchResult } from '../../src/modules/sources/ports/listing-source.port';
import { BenchmarkCacheService } from '../../src/modules/valuation/benchmark-cache.service';
import { MILEAGE_BAND_K } from '../../src/modules/valuation/cohort';

function profile(overrides: Partial<SearchProfile> = {}): SearchProfile {
  return {
    id: 'p1',
    name: 'test profile',
    sourceKey: 'auto-ria',
    categoryId: 1,
    stateId: null,
    cityId: null,
    filters: { makeModelPairs: [] },
    priceFrom: null,
    priceTo: null,
    currency: Currency.USD,
    minDealScore: 0.3,
    confidenceMinSamples: 10,
    dealerPolicy: 'label',
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as SearchProfile;
}

function listing(overrides: Partial<CoverageListing> = {}): CoverageListing {
  return {
    stateId: null,
    cityId: null,
    markId: 9,
    modelId: 3219,
    year: 2017,
    mileage: 120,
    currentAmount: 12000,
    currentCurrency: Currency.USD,
    sellerType: 'private',
    make: 'BMW',
    model: '3 Series',
    ...overrides,
  };
}

describe('isSearchEligible', () => {
  const complete = (ids: string[], total?: number): SourceSearchResult => ({ ids, total });

  it('is false when the profile has a submittedWithin filter', () => {
    const p = profile({ filters: { makeModelPairs: [], submittedWithin: 2 } });
    expect(isSearchEligible(p, complete(['1', '2'], 2))).toBe(false);
  });

  it('is false when total exceeds the returned ids (paging truncation)', () => {
    expect(isSearchEligible(profile(), complete(['1', '2'], 5))).toBe(false);
  });

  it('is true when total equals the returned ids', () => {
    expect(isSearchEligible(profile(), complete(['1', '2'], 2))).toBe(true);
  });

  it('is false when total is missing and ids are at the page cap (100)', () => {
    const ids = Array.from({ length: 100 }, (_, i) => String(i));
    expect(isSearchEligible(profile(), complete(ids))).toBe(false);
  });

  it('is true when total is missing and ids are below the page cap', () => {
    const ids = Array.from({ length: 99 }, (_, i) => String(i));
    expect(isSearchEligible(profile(), complete(ids))).toBe(true);
  });
});

describe('profileCovers', () => {
  it('covers a listing matching every dimension', () => {
    expect(profileCovers(profile(), listing())).toBe(true);
  });

  it('rejects on stateId mismatch', () => {
    expect(profileCovers(profile({ stateId: 5 }), listing({ stateId: 6 }))).toBe(false);
  });

  it('rejects when listing has no stateId but profile requires one (conservative)', () => {
    expect(profileCovers(profile({ stateId: 5 }), listing({ stateId: null }))).toBe(false);
  });

  it('rejects on cityId mismatch', () => {
    expect(profileCovers(profile({ cityId: 5 }), listing({ cityId: 6 }))).toBe(false);
  });

  it('empty makeModelPairs matches any make/model', () => {
    const p = profile({ filters: { makeModelPairs: [] } });
    expect(profileCovers(p, listing({ markId: 1, modelId: 2 }))).toBe(true);
  });

  it('non-empty makeModelPairs requires a matching pair', () => {
    const p = profile({ filters: { makeModelPairs: [{ markId: 9, modelId: 3219 }] } });
    expect(profileCovers(p, listing({ markId: 9, modelId: 3219 }))).toBe(true);
    expect(profileCovers(p, listing({ markId: 9, modelId: 9999 }))).toBe(false);
  });

  it('rejects when listing has no markId/modelId but profile constrains make/model (conservative)', () => {
    const p = profile({ filters: { makeModelPairs: [{ markId: 9, modelId: 3219 }] } });
    expect(profileCovers(p, listing({ markId: null, modelId: null }))).toBe(false);
  });

  it('respects yearFrom/yearTo bounds', () => {
    const p = profile({ filters: { makeModelPairs: [], yearFrom: 2015, yearTo: 2019 } });
    expect(profileCovers(p, listing({ year: 2017 }))).toBe(true);
    expect(profileCovers(p, listing({ year: 2014 }))).toBe(false);
    expect(profileCovers(p, listing({ year: 2020 }))).toBe(false);
  });

  it('respects priceFrom/priceTo bounds in USD', () => {
    const p = profile({ priceFrom: 10000, priceTo: 15000 });
    expect(profileCovers(p, listing({ currentAmount: 12000, currentCurrency: Currency.USD }))).toBe(true);
    expect(profileCovers(p, listing({ currentAmount: 9000, currentCurrency: Currency.USD }))).toBe(false);
    expect(profileCovers(p, listing({ currentAmount: 16000, currentCurrency: Currency.USD }))).toBe(false);
  });

  it('rejects a price filter against a non-USD listing (conservative)', () => {
    const p = profile({ priceFrom: 10000 });
    expect(profileCovers(p, listing({ currentAmount: 300000, currentCurrency: Currency.UAH }))).toBe(false);
  });

  it('respects mileageFrom/mileageTo bounds (thousand km)', () => {
    const p = profile({ filters: { makeModelPairs: [], mileageFrom: 50, mileageTo: 150 } });
    expect(profileCovers(p, listing({ mileage: 120 }))).toBe(true);
    expect(profileCovers(p, listing({ mileage: 10 }))).toBe(false);
    expect(profileCovers(p, listing({ mileage: 200 }))).toBe(false);
  });

  it('rejects when listing has no mileage but profile constrains mileage (conservative)', () => {
    const p = profile({ filters: { makeModelPairs: [], mileageFrom: 50 } });
    expect(profileCovers(p, listing({ mileage: null }))).toBe(false);
  });

  it('excludes make/model substrings in excludeMakeModels', () => {
    const p = profile({ filters: { makeModelPairs: [], excludeMakeModels: ['Daewoo Lanos'] } });
    expect(profileCovers(p, listing({ make: 'Daewoo', model: 'Lanos' }))).toBe(false);
    expect(profileCovers(p, listing({ make: 'BMW', model: '3 Series' }))).toBe(true);
  });

  it('excludes dealer listings when dealerPolicy is exclude', () => {
    const p = profile({ dealerPolicy: 'exclude' });
    expect(profileCovers(p, listing({ sellerType: 'dealer' }))).toBe(false);
    expect(profileCovers(p, listing({ sellerType: 'private' }))).toBe(true);
  });

  it('does not exclude dealer listings when dealerPolicy is label/ignore', () => {
    expect(profileCovers(profile({ dealerPolicy: 'label' }), listing({ sellerType: 'dealer' }))).toBe(true);
    expect(profileCovers(profile({ dealerPolicy: 'ignore' }), listing({ sellerType: 'dealer' }))).toBe(true);
  });
});

describe('priceCutStats', () => {
  const at = (h: number) => new Date(2026, 0, 1, h);
  const obs = (amountUsd: number, h: number) => ({ amountUsd, observedAt: at(h) });

  it('counts strictly-decreasing consecutive steps and detects any cut vs first', () => {
    const stats = priceCutStats([obs(100, 0), obs(90, 1), obs(95, 2), obs(80, 3)]);
    expect(stats.priceCutsCount).toBe(2); // 100->90, 95->80
    expect(stats.hadPriceCut).toBe(true);
  });

  it('is zero/false for an increasing-only sequence', () => {
    const stats = priceCutStats([obs(80, 0), obs(90, 1), obs(100, 2)]);
    expect(stats.priceCutsCount).toBe(0);
    expect(stats.hadPriceCut).toBe(false);
  });

  it('is zero/false for a single observation', () => {
    expect(priceCutStats([obs(100, 0)])).toEqual({ priceCutsCount: 0, hadPriceCut: false });
  });

  it('is zero/false for no observations', () => {
    expect(priceCutStats([])).toEqual({ priceCutsCount: 0, hadPriceCut: false });
  });

  it('sorts out-of-order input by observedAt before computing', () => {
    const stats = priceCutStats([obs(90, 1), obs(100, 0), obs(80, 3), obs(95, 2)]);
    expect(stats.priceCutsCount).toBe(2);
    expect(stats.hadPriceCut).toBe(true);
  });
});

describe('domDays', () => {
  it('computes exact whole days', () => {
    const first = new Date('2026-07-01T00:00:00Z');
    const last = new Date('2026-07-05T00:00:00Z');
    expect(domDays(first, last)).toBe(4);
  });

  it('rounds to the nearest day', () => {
    const first = new Date('2026-07-01T00:00:00Z');
    const last = new Date('2026-07-01T13:00:00Z'); // 0.5417 day -> rounds to 1
    expect(domDays(first, last)).toBe(1);
    const lastDown = new Date('2026-07-01T11:00:00Z'); // 0.4583 day -> rounds to 0
    expect(domDays(first, lastDown)).toBe(0);
  });

  it('clamps negative durations to 0', () => {
    const first = new Date('2026-07-05T00:00:00Z');
    const last = new Date('2026-07-01T00:00:00Z');
    expect(domDays(first, last)).toBe(0);
  });
});

describe('cohortKeyForListing', () => {
  function cohortListing(overrides: Partial<CohortListing> = {}): CohortListing {
    return { markId: 9, modelId: 3219, year: 2017, mileage: 120, ...overrides };
  }

  it('returns null when markId or modelId is missing', () => {
    expect(cohortKeyForListing(cohortListing({ markId: null }))).toBeNull();
    expect(cohortKeyForListing(cohortListing({ modelId: null }))).toBeNull();
  });

  it('matches BenchmarkCacheService.cohortKey format with mileage', () => {
    const key = cohortKeyForListing(cohortListing({ mileage: 120 }));
    const expected = BenchmarkCacheService.cohortKey({
      markId: 9,
      modelId: 3219,
      yearFrom: 2016,
      yearTo: 2018,
      mileageFrom: 120 - MILEAGE_BAND_K,
      mileageTo: 120 + MILEAGE_BAND_K,
    });
    expect(key).toBe(expected);
  });

  it('matches BenchmarkCacheService.cohortKey format without mileage', () => {
    const key = cohortKeyForListing(cohortListing({ mileage: null }));
    const expected = BenchmarkCacheService.cohortKey({
      markId: 9,
      modelId: 3219,
      yearFrom: 2016,
      yearTo: 2018,
    });
    expect(key).toBe(expected);
  });

  it('floors the lower mileage bound at 0 for low-mileage cars', () => {
    const key = cohortKeyForListing(cohortListing({ mileage: 10 }));
    const expected = BenchmarkCacheService.cohortKey({
      markId: 9,
      modelId: 3219,
      yearFrom: 2016,
      yearTo: 2018,
      mileageFrom: 0,
      mileageTo: 10 + MILEAGE_BAND_K,
    });
    expect(key).toBe(expected);
  });
});

describe('isRelistMatch', () => {
  function candidate(overrides: Partial<RelistCandidate> = {}): RelistCandidate {
    return {
      vin: null,
      markId: 9,
      modelId: 3219,
      year: 2017,
      cityId: 100,
      mileage: 120,
      ...overrides,
    };
  }

  it('matches on VIN despite formatting differences (case/whitespace)', () => {
    const prev = candidate({ vin: 'jmzbk12z ea1 234567' });
    const next = candidate({ vin: 'JMZBK12ZEA1234567', markId: 1, modelId: 2, year: 1999, cityId: 5, mileage: 999 });
    expect(isRelistMatch(prev, next)).toBe(true);
  });

  it('does not match on VIN mismatch, but does match on equal attributes', () => {
    const prev = candidate({ vin: 'JMZBK12ZEA1234567' });
    const next = candidate({ vin: 'WBAAA1234567890AA' });
    expect(isRelistMatch(prev, next)).toBe(true); // attributes still equal
  });

  it('matches when mileage delta is exactly at the tolerance (inclusive)', () => {
    const prev = candidate({ mileage: 120 });
    const next = candidate({ mileage: 120 + RELIST_MILEAGE_TOLERANCE_K });
    expect(isRelistMatch(prev, next)).toBe(true);
  });

  it('fails when mileage delta exceeds the tolerance', () => {
    const prev = candidate({ mileage: 120 });
    const next = candidate({ mileage: 122.5 });
    expect(isRelistMatch(prev, next)).toBe(false);
  });

  it('fails when cityId is missing on either side', () => {
    const prev = candidate({ cityId: null });
    const next = candidate();
    expect(isRelistMatch(prev, next)).toBe(false);
  });

  it('fails when make/model/year differ', () => {
    const prev = candidate({ markId: 9 });
    const next = candidate({ markId: 10 });
    expect(isRelistMatch(prev, next)).toBe(false);
  });
});
