import { PinoLogger } from 'nestjs-pino';

import { Currency } from '../../src/common/types/money';
import { RateBudgetExhaustedError } from '../../src/common/errors/domain-error';
import { OutcomesService } from '../../src/modules/calibration/outcomes.service';
import { SWEEP_GRACE_HOURS } from '../../src/modules/listings/disappearance';
import { DisappearancesService } from '../../src/modules/listings/disappearances.service';
import { ListingDisappearance } from '../../src/modules/listings/entities/listing-disappearance.entity';
import { ProfileFilters, SearchProfile } from '../../src/modules/profiles/entities/search-profile.entity';
import { ProfilesService } from '../../src/modules/profiles/profiles.service';
import { ListingSource } from '../../src/modules/sources/ports/listing-source.port';
import { SweepService } from '../../src/modules/polling/sweep.service';

/** Mirrors sweep.service.ts's private MAX_SWEEP_PAGES — kept in sync manually (not exported;
 * the constant is an internal safety cap, not part of the service's public contract). */
const MAX_SWEEP_PAGES = 250;

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as PinoLogger;

function makeProfile(overrides: Partial<SearchProfile> = {}, filters: Partial<ProfileFilters> = {}): SearchProfile {
  return {
    id: 'profile-1',
    name: 'sweep profile',
    sourceKey: 'auto-ria',
    categoryId: 1,
    stateId: null,
    cityId: null,
    filters: { makeModelPairs: [], sweep: true, ...filters },
    priceFrom: null,
    priceTo: 15000,
    currency: Currency.USD,
    minDealScore: 0.3,
    confidenceMinSamples: 5,
    dealerPolicy: 'label',
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as SearchProfile;
}

function idsFor(page: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `p${page}-${i}`);
}

function fakeEvent(listingId: string): ListingDisappearance {
  return { listingId } as ListingDisappearance;
}

interface Fakes {
  profilesService: ProfilesService;
  source: ListingSource & { search: jest.Mock };
  disappearances: DisappearancesService & { processCycle: jest.Mock };
  outcomes: OutcomesService & { recordPassive: jest.Mock };
  getEnabled: jest.Mock;
}

function buildFakes(): Fakes {
  const getEnabled = jest.fn();
  const search = jest.fn();
  const processCycle = jest.fn().mockResolvedValue([]);
  const recordPassive = jest.fn().mockResolvedValue(null);

  const profilesService = { getEnabled } as unknown as ProfilesService;
  const source = {
    key: 'auto-ria',
    search,
    fetch: jest.fn(),
    averagePrice: jest.fn(),
    dictionaries: jest.fn(),
  } as unknown as ListingSource & { search: jest.Mock };
  const disappearances = { processCycle } as unknown as DisappearancesService & { processCycle: jest.Mock };
  const outcomes = { recordPassive } as unknown as OutcomesService & { recordPassive: jest.Mock };

  return { profilesService, source, disappearances, outcomes, getEnabled };
}

function buildService(fakes: Fakes): SweepService {
  return new SweepService(fakes.profilesService, fakes.source, fakes.disappearances, fakes.outcomes, noopLogger);
}

describe('SweepService.sweep', () => {
  it('crawls multiple pages, stops on a short page, and runs detection once over the union of ids', async () => {
    const fakes = buildFakes();
    const profile = makeProfile();
    fakes.getEnabled.mockResolvedValue([profile]);
    fakes.source.search.mockImplementation(async ({ page }: { page: number }) => {
      if (page === 0) return { ids: idsFor(0, 100), total: 250 };
      if (page === 1) return { ids: idsFor(1, 100), total: 250 };
      if (page === 2) return { ids: idsFor(2, 50), total: 250 };
      throw new Error(`unexpected page ${page}`);
    });
    fakes.disappearances.processCycle.mockResolvedValue([fakeEvent('l1'), fakeEvent('l2')]);

    const service = buildService(fakes);
    await service.sweep();

    expect(fakes.source.search).toHaveBeenCalledTimes(3);
    expect(fakes.source.search.mock.calls.map((c) => c[0].page)).toEqual([0, 1, 2]);

    expect(fakes.disappearances.processCycle).toHaveBeenCalledTimes(1);
    const [idsArg, profilesArg, graceArg] = fakes.disappearances.processCycle.mock.calls[0];
    expect(idsArg).toBeInstanceOf(Set);
    expect((idsArg as Set<string>).size).toBe(250);
    expect(profilesArg).toEqual([profile]);
    expect(graceArg).toBe(SWEEP_GRACE_HOURS);

    expect(fakes.outcomes.recordPassive).toHaveBeenCalledTimes(2);
    expect(fakes.outcomes.recordPassive).toHaveBeenCalledWith({ listingId: 'l1', label: 'disappeared' });
    expect(fakes.outcomes.recordPassive).toHaveBeenCalledWith({ listingId: 'l2', label: 'disappeared' });
  });

  it('stops as soon as the collected ids reach the reported total, even on full pages', async () => {
    const fakes = buildFakes();
    const profile = makeProfile();
    fakes.getEnabled.mockResolvedValue([profile]);
    fakes.source.search.mockImplementation(async ({ page }: { page: number }) => ({
      ids: idsFor(page, 100),
      total: 200,
    }));

    const service = buildService(fakes);
    await service.sweep();

    expect(fakes.source.search).toHaveBeenCalledTimes(2);
    const idsArg = fakes.disappearances.processCycle.mock.calls[0][0] as Set<string>;
    expect(idsArg.size).toBe(200);
  });

  it('discards the sweep and never runs detection when the budget is exhausted mid-crawl', async () => {
    const fakes = buildFakes();
    const profile = makeProfile();
    fakes.getEnabled.mockResolvedValue([profile]);
    fakes.source.search.mockImplementation(async ({ page }: { page: number }) => {
      if (page === 0) return { ids: idsFor(0, 100), total: 300 };
      throw new RateBudgetExhaustedError('budget gone');
    });

    const service = buildService(fakes);
    await expect(service.sweep()).resolves.toBeUndefined();

    expect(fakes.disappearances.processCycle).not.toHaveBeenCalled();
    expect(fakes.outcomes.recordPassive).not.toHaveBeenCalled();
  });

  it('skips a profile that errors (non-budget) but still crawls the next sweep profile', async () => {
    const fakes = buildFakes();
    const failingProfile = makeProfile({ id: 'profile-fail', name: 'failing', categoryId: 1 });
    const okProfile = makeProfile({ id: 'profile-ok', name: 'ok', categoryId: 2 });
    fakes.getEnabled.mockResolvedValue([failingProfile, okProfile]);
    fakes.source.search.mockImplementation(async ({ categoryId }: { categoryId: number }) => {
      if (categoryId === 1) throw new Error('source blew up');
      return { ids: idsFor(0, 10), total: 10 };
    });

    const service = buildService(fakes);
    await expect(service.sweep()).resolves.toBeUndefined();

    // Both profiles were attempted (the failure on the first did not stop the run)...
    expect(fakes.source.search).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 1, page: 0 }));
    expect(fakes.source.search).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 2, page: 0 }));
    // ...but detection only ran for the profile whose crawl completed.
    expect(fakes.disappearances.processCycle).toHaveBeenCalledTimes(1);
    expect(fakes.disappearances.processCycle).toHaveBeenCalledWith(expect.any(Set), [okProfile], SWEEP_GRACE_HOURS);
  });

  it('treats an empty first page as a complete (trivial) sweep and still runs detection', async () => {
    const fakes = buildFakes();
    const profile = makeProfile();
    fakes.getEnabled.mockResolvedValue([profile]);
    fakes.source.search.mockResolvedValue({ ids: [], total: 0 });

    const service = buildService(fakes);
    await service.sweep();

    expect(fakes.source.search).toHaveBeenCalledTimes(1);
    expect(fakes.disappearances.processCycle).toHaveBeenCalledTimes(1);
    const idsArg = fakes.disappearances.processCycle.mock.calls[0][0] as Set<string>;
    expect(idsArg.size).toBe(0);
  });

  it('never searches profiles that are not flagged sweep', async () => {
    const fakes = buildFakes();
    const sweepProfile = makeProfile({ id: 'sweep-1', categoryId: 1 }, { sweep: true });
    const regularProfile = makeProfile({ id: 'regular-1', categoryId: 2 }, { sweep: false });
    // Simulate ProfilesService.getEnabled returning all enabled profiles; SweepService must
    // filter to sweep ones itself, same contract as PollService filters them out.
    fakes.getEnabled.mockResolvedValue([sweepProfile, regularProfile]);
    fakes.source.search.mockResolvedValue({ ids: idsFor(0, 5), total: 5 });

    const service = buildService(fakes);
    await service.sweep();

    expect(fakes.source.search).toHaveBeenCalledTimes(1);
    expect(fakes.source.search).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 1 }));
  });

  it('caps the crawl at MAX_SWEEP_PAGES and treats the result as incomplete (no detection)', async () => {
    const fakes = buildFakes();
    const profile = makeProfile();
    fakes.getEnabled.mockResolvedValue([profile]);
    let calls = 0;
    fakes.source.search.mockImplementation(async ({ page }: { page: number }) => {
      calls++;
      // Always a full page with no reported total — nothing but the cap can stop this crawl.
      return { ids: idsFor(page, 100) };
    });

    const service = buildService(fakes);
    await service.sweep();

    expect(calls).toBe(MAX_SWEEP_PAGES + 1);
    expect(fakes.disappearances.processCycle).not.toHaveBeenCalled();
    expect(fakes.outcomes.recordPassive).not.toHaveBeenCalled();
  }, 15000);
});
