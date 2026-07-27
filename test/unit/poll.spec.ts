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
      redFlags: [],
      isOpportunity: false,
    }),
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

describe('PollService priority order', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('processes tier-1 re-checks before tier-2 new listings when budget is tight', async () => {
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

    (fakes.source.fetch as jest.Mock)
      .mockImplementationOnce(() =>
        makeDetail({
          externalId: 'old-1',
          price: { amount: 10000, currency: Currency.USD },
        }),
      )
      .mockRejectedValueOnce(new RateBudgetExhaustedError('budget gone'));

    await expect((service as unknown as { runCycle: () => Promise<void> }).runCycle()).resolves.toBeUndefined();

    expect(fakes.source.fetch).toHaveBeenCalledTimes(2);
    expect(fakes.source.fetch.mock.calls.map((call) => call[1])).toEqual([1, 2]);
    expect(fakes.source.fetch.mock.calls.map((call) => call[0])).toEqual(['old-1', 'new-1']);
  });
});
