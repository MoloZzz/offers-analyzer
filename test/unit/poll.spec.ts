import { PinoLogger } from 'nestjs-pino';

import { RateBudgetExhaustedError } from '../../src/common/errors/domain-error';
import { Currency } from '../../src/common/types/money';
import { OutcomesService } from '../../src/modules/calibration/outcomes.service';
import { ExchangeRate } from '../../src/modules/fx/ports/exchange-rate.port';
import { HealthService } from '../../src/modules/health/health.service';
import { DisappearancesService } from '../../src/modules/listings/disappearances.service';
import { Listing } from '../../src/modules/listings/entities/listing.entity';
import { ListingsService } from '../../src/modules/listings/listings.service';
import { AlertedCarsService } from '../../src/modules/notifications/alerted-cars.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { PollService } from '../../src/modules/polling/poll.service';
import { ProfileFilters, SearchProfile } from '../../src/modules/profiles/entities/search-profile.entity';
import { ProfilesService } from '../../src/modules/profiles/profiles.service';
import {
  ListingDetail,
  ListingSource,
  SourceSearchResult,
} from '../../src/modules/sources/ports/listing-source.port';
import { BenchmarkCacheService } from '../../src/modules/valuation/benchmark-cache.service';
import { Opportunity } from '../../src/modules/valuation/entities/opportunity.entity';
import { MileageAdjuster } from '../../src/modules/valuation/mileage';
import { ValuationService } from '../../src/modules/valuation/valuation.service';

const noopLogger = {
  warn: () => {},
  error: () => {},
  info: () => {},
  debug: () => {},
} as unknown as PinoLogger;

function makeProfile(overrides: Partial<SearchProfile> = {}, filters: Partial<ProfileFilters> = {}): SearchProfile {
  return {
    id: 'profile-1',
    name: 'profile',
    sourceKey: 'auto-ria',
    categoryId: 1,
    stateId: null,
    cityId: null,
    filters: { makeModelPairs: [], sweep: false, ...filters },
    priceFrom: null,
    priceTo: null,
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

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'listing-1',
    externalId: 'old-1',
    currentAmount: 10000,
    currentCurrency: Currency.USD,
    lastScore: 55,
    lastSeenAt: new Date('2026-07-26T00:00:00Z'),
    stateId: null,
    cityId: null,
    markId: 9,
    modelId: 96,
    year: 2017,
    mileage: 150,
    sellerType: 'private',
    make: 'Volkswagen',
    model: 'Passat',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Listing;
}

function makeDetail(overrides: Partial<ListingDetail> = {}): ListingDetail {
  return {
    externalId: 'old-1',
    make: 'Volkswagen',
    model: 'Passat',
    markId: 9,
    modelId: 96,
    year: 2017,
    sellerType: 'private',
    hasVinReport: false,
    url: 'https://auto.ria.com/old-1',
    price: { amount: 9800, currency: Currency.USD },
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

interface Fakes {
  profilesService: ProfilesService;
  source: ListingSource & {
    search: jest.Mock;
    fetch: jest.Mock;
    averagePrice: jest.Mock;
  };
  listingsService: ListingsService & {
    findByExternalIds: jest.Mock;
    recordSeen: jest.Mock;
    recordEvaluation: jest.Mock;
  };
  disappearancesService: DisappearancesService & { processCycle: jest.Mock; checkRelist: jest.Mock };
  valuationService: ValuationService;
  benchmarks: BenchmarkCacheService;
  opportunities: { save: jest.Mock; create: jest.Mock };
  notifications: NotificationsService;
  fx: ExchangeRate;
  mileage: MileageAdjuster;
  outcomes: OutcomesService;
  health: HealthService;
  alertedCars: AlertedCarsService;
}

function buildFakes(): Fakes {
  const profilesService = {
    getEnabled: jest.fn().mockResolvedValue([makeProfile()]),
  } as unknown as ProfilesService;

  const source = {
    key: 'auto-ria',
    search: jest.fn(),
    fetch: jest.fn(),
    averagePrice: jest.fn(),
    dictionaries: jest.fn(),
  } as unknown as ListingSource & {
    search: jest.Mock;
    fetch: jest.Mock;
    averagePrice: jest.Mock;
  };

  const listingsService = {
    findByExternalIds: jest.fn().mockResolvedValue([makeListing()]),
    recordSeen: jest.fn().mockResolvedValue({ listing: makeListing(), isNew: false }),
    recordEvaluation: jest.fn().mockResolvedValue(undefined),
  } as unknown as ListingsService & {
    findByExternalIds: jest.Mock;
    recordSeen: jest.Mock;
    recordEvaluation: jest.Mock;
  };

  const disappearancesService = {
    processCycle: jest.fn().mockResolvedValue([]),
    checkRelist: jest.fn().mockResolvedValue(undefined),
  } as unknown as DisappearancesService & { processCycle: jest.Mock; checkRelist: jest.Mock };

  const valuationService = {
    evaluate: jest.fn().mockReturnValue({
      score: 0,
      discountPct: 0,
      confidence: 0,
      redFlags: {},
      isOpportunity: false,
      reason: 'below threshold',
      raw: 0,
      penalty: 1,
      disqualified: false,
      priceCore: 0,
      factors: [],
      total100: 50,
    }),
    activeParameterVersion: jest.fn().mockReturnValue(7),
    heuristicTableHashes: jest.fn().mockReturnValue({}),
  } as unknown as ValuationService;

  const benchmarks = {
    getOrLoad: jest.fn(),
  } as unknown as BenchmarkCacheService;

  const opportunities = {
    create: jest.fn((x) => x),
    save: jest.fn().mockResolvedValue({ id: 'opp-1', notified: false }),
  };

  const notifications = {
    notifyOpportunity: jest.fn().mockResolvedValue(undefined),
    notifyPriceDrop: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationsService;

  const fx = { rate: jest.fn().mockResolvedValue(1) } as unknown as ExchangeRate;
  const mileage = { fairValue: jest.fn() } as unknown as MileageAdjuster;
  const outcomes = { recordPassive: jest.fn().mockResolvedValue(undefined) } as unknown as OutcomesService;
  const health = { markPollSuccess: jest.fn(), markPollFailure: jest.fn() } as unknown as HealthService;
  const alertedCars = { decideAndRecord: jest.fn() } as unknown as AlertedCarsService;

  return {
    profilesService,
    source,
    listingsService,
    disappearancesService,
    valuationService,
    benchmarks,
    opportunities,
    notifications,
    fx,
    mileage,
    outcomes,
    health,
    alertedCars,
  };
}

function buildService(fakes: Fakes): PollService {
  return new PollService(
    fakes.profilesService,
    fakes.source,
    fakes.listingsService,
    fakes.valuationService,
    fakes.benchmarks,
    fakes.opportunities as unknown as import('typeorm').Repository<Opportunity>,
    fakes.notifications,
    fakes.fx,
    fakes.mileage,
    fakes.outcomes,
    fakes.health,
    fakes.alertedCars,
    fakes.disappearancesService,
    noopLogger,
  );
}

describe('PollService budget-stabilized work selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not routinely re-check an already scored listing', async () => {
    const fakes = buildFakes();
    const service = buildService(fakes);

    const staleListing = makeListing({
      externalId: 'old-1',
      currentAmount: 10000,
      lastScore: 55,
    });

    (fakes.profilesService.getEnabled as jest.Mock).mockResolvedValue([makeProfile()]);
    (fakes.source.search as jest.Mock).mockResolvedValue({
      ids: ['new-1', 'old-1'],
      total: 2,
    } satisfies SourceSearchResult);
    (fakes.listingsService.findByExternalIds as jest.Mock).mockResolvedValue([staleListing]);
    (fakes.listingsService.recordSeen as jest.Mock).mockResolvedValue({ listing: staleListing, isNew: false });

    (fakes.source.fetch as jest.Mock).mockRejectedValueOnce(new RateBudgetExhaustedError('budget gone'));

    await expect((service as unknown as { runCycle: () => Promise<void> }).runCycle()).resolves.toBeUndefined();

    expect(fakes.source.fetch).toHaveBeenCalledTimes(1);
    expect(fakes.source.fetch).toHaveBeenCalledWith(
      'new-1',
      2,
      expect.objectContaining({ operation: 'new_listing_detail' }),
    );
  });

  it('recovers at most one never-scored listing in a 30-minute window', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-28T10:30:00Z'));
    const fakes = buildFakes();
    const service = buildService(fakes);
    const oldest = makeListing({ externalId: 'oldest', lastScore: null, lastSeenAt: new Date('2026-07-20T00:00:00Z') });
    const newer = makeListing({ externalId: 'newer', lastScore: null, lastSeenAt: new Date('2026-07-21T00:00:00Z') });
    (fakes.source.search as jest.Mock).mockResolvedValue({ ids: ['oldest', 'newer'], total: 2 });
    (fakes.listingsService.findByExternalIds as jest.Mock).mockResolvedValue([oldest, newer]);
    (fakes.source.fetch as jest.Mock).mockRejectedValue(new RateBudgetExhaustedError('budget gone'));

    await (service as unknown as { runCycle: () => Promise<void> }).runCycle();

    expect(fakes.source.fetch).toHaveBeenCalledTimes(1);
    expect(fakes.source.fetch).toHaveBeenCalledWith('oldest', 1, expect.anything());
    jest.useRealTimers();
  });

  it('continues collecting fresh listings when a tier-5 benchmark is refused', async () => {
    const fakes = buildFakes();
    const service = buildService(fakes);
    const first = makeListing({ id: 'first', externalId: 'new-1', lastScore: null });
    const second = makeListing({ id: 'second', externalId: 'new-2', lastScore: null });
    (fakes.source.search as jest.Mock).mockResolvedValue({ ids: ['new-1', 'new-2'], total: 2 });
    (fakes.listingsService.findByExternalIds as jest.Mock).mockResolvedValue([]);
    (fakes.source.fetch as jest.Mock)
      .mockResolvedValueOnce(makeDetail({ externalId: 'new-1' }))
      .mockResolvedValueOnce(makeDetail({ externalId: 'new-2' }));
    (fakes.listingsService.recordSeen as jest.Mock)
      .mockResolvedValueOnce({ listing: first, isNew: true })
      .mockResolvedValueOnce({ listing: second, isNew: true });
    (fakes.benchmarks.getOrLoad as jest.Mock)
      .mockRejectedValueOnce(new RateBudgetExhaustedError('tier-5 denied'))
      .mockResolvedValueOnce({ value: { amount: 12000, currency: Currency.USD }, sampleSize: 15 });
    (fakes.mileage.fairValue as jest.Mock).mockReturnValue(11800);

    await (service as unknown as { runCycle: () => Promise<void> }).runCycle();

    expect(fakes.source.fetch.mock.calls.map((call) => call[0])).toEqual(['new-1', 'new-2']);
    expect(fakes.listingsService.recordEvaluation).toHaveBeenCalledTimes(1);
  });

  it('persists an explanation snapshot for evaluated non-opportunities', async () => {
    const fakes = buildFakes();
    const service = buildService(fakes);
    const listing = makeListing({ externalId: 'new-1', lastScore: null });

    (fakes.source.search as jest.Mock).mockResolvedValue({ ids: ['new-1'], total: 1 });
    (fakes.listingsService.findByExternalIds as jest.Mock).mockResolvedValue([]);
    (fakes.source.fetch as jest.Mock).mockResolvedValue(makeDetail({ externalId: 'new-1' }));
    (fakes.listingsService.recordSeen as jest.Mock).mockResolvedValue({ listing, isNew: true });
    (fakes.benchmarks.getOrLoad as jest.Mock).mockResolvedValue({
      value: { amount: 12000, currency: Currency.USD },
      sampleSize: 15,
    });
    (fakes.mileage.fairValue as jest.Mock).mockReturnValue(11800);

    await (service as unknown as { runCycle: () => Promise<void> }).runCycle();

    expect(fakes.listingsService.recordEvaluation).toHaveBeenCalledWith(
      listing,
      0,
      0,
      'profile-1',
      expect.objectContaining({
        parameterSetVersion: 7,
        thresholdUsed: 0.3,
        fairValueBase: 12000,
        fairValueAdjusted: 11800,
        cohort: expect.objectContaining({ sampleSize: 15 }),
      }),
    );
    expect(fakes.opportunities.save).not.toHaveBeenCalled();
  });

  it('copies the same explanation snapshot onto opportunities', async () => {
    const fakes = buildFakes();
    const service = buildService(fakes);
    const listing = makeListing({ externalId: 'new-1', lastScore: null });
    const created: Partial<Opportunity>[] = [];

    (fakes.source.search as jest.Mock).mockResolvedValue({ ids: ['new-1'], total: 1 });
    (fakes.listingsService.findByExternalIds as jest.Mock).mockResolvedValue([]);
    (fakes.source.fetch as jest.Mock).mockResolvedValue(makeDetail({ externalId: 'new-1' }));
    (fakes.listingsService.recordSeen as jest.Mock).mockResolvedValue({ listing, isNew: true });
    (fakes.benchmarks.getOrLoad as jest.Mock).mockResolvedValue({
      value: { amount: 12000, currency: Currency.USD },
      sampleSize: 15,
    });
    (fakes.mileage.fairValue as jest.Mock).mockReturnValue(11800);
    (fakes.valuationService.evaluate as jest.Mock).mockReturnValue({
      score: 0.5,
      discountPct: 17,
      confidence: 1,
      redFlags: { no_vin_report: true },
      isOpportunity: true,
      reason: 'deal score 0.5 >= threshold 0.3',
      raw: 0.57,
      penalty: 0.8,
      disqualified: false,
      priceCore: 0.46,
      factors: [],
      total100: 75,
    });
    (fakes.opportunities.create).mockImplementation((x) => {
      created.push(x);
      return x;
    });
    (fakes.opportunities.save).mockImplementation((x) =>
      Promise.resolve({ id: 'opp-1', ...x }),
    );

    await (service as unknown as { runCycle: () => Promise<void> }).runCycle();

    const listingExplanation = (fakes.listingsService.recordEvaluation as jest.Mock).mock.calls[0][4];
    expect(created[0].explanation).toBe(listingExplanation);
    expect(created[0].explanation).toEqual(
      expect.objectContaining({
        parameterSetVersion: 7,
        thresholdUsed: 0.3,
        firedFlags: [{ code: 'no_vin_report', source: 'auto-ria' }],
      }),
    );
  });
});
