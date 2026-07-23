import { PinoLogger } from 'nestjs-pino';
import { FindOperator, Repository } from 'typeorm';

import { Currency } from '../../src/common/types/money';
import { GRACE_HOURS } from '../../src/modules/listings/disappearance';
import { DisappearancesService } from '../../src/modules/listings/disappearances.service';
import { ListingDisappearance } from '../../src/modules/listings/entities/listing-disappearance.entity';
import { Listing } from '../../src/modules/listings/entities/listing.entity';
import { PriceObservation } from '../../src/modules/listings/entities/price-observation.entity';
import { ProfileFilters, SearchProfile } from '../../src/modules/profiles/entities/search-profile.entity';

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as PinoLogger;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Matches TypeORM's `find`/`update` where-shapes, including the operators this service uses. */
function matchesValue(actual: unknown, expected: unknown): boolean {
  if (expected instanceof FindOperator) {
    switch (expected.type) {
      case 'in':
        return Array.isArray(expected.value) && expected.value.includes(actual);
      case 'isNull':
        return actual === null || actual === undefined;
      case 'lessThan':
        return actual != null && (actual as Date).getTime() < (expected.value as Date).getTime();
      case 'moreThanOrEqual':
        return actual != null && (actual as Date).getTime() >= (expected.value as Date).getTime();
      default:
        throw new Error(`fake repo: unsupported operator ${expected.type}`);
    }
  }
  return actual === expected;
}

function matches<T>(row: T, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => matchesValue((row as never)[key], value));
}

/** Minimal in-memory fake — only the find/findOne/save/update/create shapes the service issues. */
function buildFakeRepo<T extends { id?: string }>(): { repo: Repository<T>; rows: T[] } {
  const rows: T[] = [];
  let nextId = 1;

  const repo = {
    async findOne({ where }: { where: Record<string, unknown> }) {
      return rows.find((row) => matches(row, where)) ?? null;
    },
    async find({ where, order }: { where?: Record<string, unknown>; order?: Record<string, string> }) {
      let result = where ? rows.filter((row) => matches(row, where)) : [...rows];
      if (order) {
        const [field, dir] = Object.entries(order)[0];
        result = [...result].sort((a, b) => {
          const av = (a as never)[field] as Date;
          const bv = (b as never)[field] as Date;
          const cmp = av.getTime() - bv.getTime();
          return dir === 'DESC' ? -cmp : cmp;
        });
      }
      return result;
    },
    create(x: Partial<T>) {
      return { id: `id-${nextId++}`, ...x } as T;
    },
    async save(x: T) {
      const idx = rows.findIndex((row) => row.id === x.id);
      if (idx === -1) {
        rows.push(x);
      } else {
        rows[idx] = x;
      }
      return x;
    },
    async update(where: Record<string, unknown>, partial: Partial<T>) {
      const affected = rows.filter((row) => matches(row, where));
      for (const row of affected) Object.assign(row as object, partial);
      return { affected: affected.length };
    },
  } as unknown as Repository<T>;

  return { repo, rows };
}

function makeListing(overrides: Partial<Listing> = {}): Listing {
  const now = new Date();
  return {
    id: `listing-${Math.random().toString(36).slice(2)}`,
    sourceKey: 'auto-ria',
    externalId: 'ext-1',
    make: 'Toyota',
    model: 'Camry',
    markId: 1,
    modelId: 2,
    year: 2018,
    mileage: 100,
    stateId: 1,
    cityId: 1,
    sellerType: 'private',
    vin: null,
    url: 'https://example.test/1',
    description: null,
    currentAmount: 10000,
    currentCurrency: Currency.USD,
    status: 'active',
    firstSeenAt: now,
    lastSeenAt: now,
    lastSeenInSearchAt: now,
    lastScore: null,
    lastDiscountPct: null,
    lastEvaluatedAt: null,
    profileId: null,
    ...overrides,
  } as Listing;
}

function makeProfile(overrides: Partial<SearchProfile> = {}, filters: Partial<ProfileFilters> = {}): SearchProfile {
  return {
    id: 'profile-1',
    name: 'test profile',
    sourceKey: 'auto-ria',
    categoryId: 1,
    stateId: null,
    cityId: null,
    filters: { makeModelPairs: [], ...filters },
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

function buildService() {
  const listingsRepo = buildFakeRepo<Listing>();
  const observationsRepo = buildFakeRepo<PriceObservation>();
  const disappearancesRepo = buildFakeRepo<ListingDisappearance>();
  const service = new DisappearancesService(
    listingsRepo.repo,
    observationsRepo.repo,
    disappearancesRepo.repo,
    noopLogger,
  );
  return { service, listingsRepo, observationsRepo, disappearancesRepo };
}

describe('DisappearancesService.processCycle', () => {
  it('bumps lastSeenInSearchAt for seen listings and never turns them into candidates', async () => {
    const { service, listingsRepo } = buildService();
    const old = new Date(Date.now() - 48 * HOUR);
    const listing = makeListing({ externalId: 'seen-1', lastSeenInSearchAt: old });
    listingsRepo.rows.push(listing);

    const result = await service.processCycle(new Set(['seen-1']), []);

    expect(result).toHaveLength(0);
    expect(listing.lastSeenInSearchAt!.getTime()).toBeGreaterThan(old.getTime());
  });

  it('records one event for an active listing absent beyond grace and covered by an eligible profile', async () => {
    const { service, listingsRepo, observationsRepo } = buildService();
    const disappearedAt = new Date(Date.now() - (GRACE_HOURS + 1) * HOUR);
    const firstSeenAt = new Date(disappearedAt.getTime() - 10 * DAY);
    const listing = makeListing({
      externalId: 'gone-1',
      lastSeenInSearchAt: disappearedAt,
      firstSeenAt,
      markId: 5,
      modelId: 9,
      year: 2019,
      mileage: 50,
    });
    listingsRepo.rows.push(listing);
    observationsRepo.rows.push(
      { id: 'obs-1', listingId: listing.id, amount: 12000, currency: Currency.USD, amountUsd: 12000, observedAt: new Date(firstSeenAt.getTime() + 1 * DAY) } as PriceObservation,
      { id: 'obs-2', listingId: listing.id, amount: 11000, currency: Currency.USD, amountUsd: 11000, observedAt: new Date(firstSeenAt.getTime() + 5 * DAY) } as PriceObservation,
    );
    const profile = makeProfile();

    const result = await service.processCycle(new Set(), [profile]);

    expect(result).toHaveLength(1);
    const event = result[0];
    expect(event.disappearedAt.getTime()).toBe(disappearedAt.getTime());
    expect(event.domDays).toBe(10);
    expect(event.priceCutsCount).toBe(1);
    expect(event.hadPriceCut).toBe(true);
    expect(event.lastKnownPriceUsd).toBe(11000);
    expect(event.cohortKey).not.toBeNull();
    expect(listing.status).toBe('removed');
  });

  it('is idempotent — a second processCycle over the same listing does not duplicate the event', async () => {
    const { service, listingsRepo } = buildService();
    const disappearedAt = new Date(Date.now() - (GRACE_HOURS + 1) * HOUR);
    const listing = makeListing({ externalId: 'gone-2', lastSeenInSearchAt: disappearedAt });
    listingsRepo.rows.push(listing);
    const profile = makeProfile();

    const first = await service.processCycle(new Set(), [profile]);
    expect(first).toHaveLength(1);

    // Simulate the listing somehow still being active+stale (should not happen in practice since
    // status flips to 'removed', but processCycle must not duplicate even if re-run).
    listing.status = 'active';
    const second = await service.processCycle(new Set(), [profile]);

    expect(second).toHaveLength(0);
  });

  it('records nothing when no eligible profile covers the candidate', async () => {
    const { service, listingsRepo } = buildService();
    const disappearedAt = new Date(Date.now() - (GRACE_HOURS + 1) * HOUR);
    const listing = makeListing({ externalId: 'gone-3', lastSeenInSearchAt: disappearedAt, markId: 5, modelId: 9 });
    listingsRepo.rows.push(listing);

    const emptyResult = await service.processCycle(new Set(), []);
    expect(emptyResult).toHaveLength(0);
    expect(listing.status).toBe('active');

    const nonCoveringProfile = makeProfile({}, { makeModelPairs: [{ markId: 999, modelId: 999 }] });
    const nonCoveredResult = await service.processCycle(new Set(), [nonCoveringProfile]);
    expect(nonCoveredResult).toHaveLength(0);
    expect(listing.status).toBe('active');
  });

  it('records nothing when the listing has been absent less than the grace period', async () => {
    const { service, listingsRepo } = buildService();
    const disappearedAt = new Date(Date.now() - (GRACE_HOURS - 1) * HOUR);
    const listing = makeListing({ externalId: 'gone-4', lastSeenInSearchAt: disappearedAt });
    listingsRepo.rows.push(listing);
    const profile = makeProfile();

    const result = await service.processCycle(new Set(), [profile]);

    expect(result).toHaveLength(0);
    expect(listing.status).toBe('active');
  });

  it('resurrects a removed listing that reappears in the seen set and voids its event', async () => {
    const { service, listingsRepo, disappearancesRepo } = buildService();
    const listing = makeListing({ externalId: 'back-1', status: 'removed' });
    listingsRepo.rows.push(listing);
    const event = {
      id: 'event-1',
      listingId: listing.id,
      cohortKey: null,
      lastKnownPriceUsd: 1000,
      firstSeenAt: new Date(),
      disappearedAt: new Date(),
      domDays: 1,
      priceCutsCount: 0,
      hadPriceCut: false,
      isRelist: false,
      relistListingId: null,
      relistDetectedAt: null,
      reappearedAt: null,
      detectionMode: 'live',
      createdAt: new Date(),
    } as ListingDisappearance;
    disappearancesRepo.rows.push(event);

    await service.processCycle(new Set(['back-1']), []);

    expect(listing.status).toBe('active');
    expect(event.reappearedAt).not.toBeNull();
  });

  it('detectionMode is backfill for a candidate whose disappearance long predates process start, live otherwise', async () => {
    // Service startup (`startedAt`) must precede "now" by real operating time for the
    // live/backfill distinction to be meaningful — use fake timers to separate the two.
    jest.useFakeTimers();
    try {
      const startupTime = new Date('2026-01-01T00:00:00.000Z');
      jest.setSystemTime(startupTime);
      const { service, listingsRepo } = buildService(); // startedAt = startupTime

      const now = new Date(startupTime.getTime() + 10 * DAY);
      jest.setSystemTime(now);
      const profile = makeProfile();

      // Predates the service's own startup by well over a grace window — backfill.
      const staleDisappearedAt = new Date(startupTime.getTime() - 30 * DAY);
      const staleListing = makeListing({ externalId: 'stale-1', lastSeenInSearchAt: staleDisappearedAt });
      listingsRepo.rows.push(staleListing);

      // Disappeared during live operation, well after startup — live.
      const freshDisappearedAt = new Date(now.getTime() - (GRACE_HOURS + 1) * HOUR);
      const freshListing = makeListing({ externalId: 'fresh-1', lastSeenInSearchAt: freshDisappearedAt });
      listingsRepo.rows.push(freshListing);

      const result = await service.processCycle(new Set(), [profile]);

      const staleEvent = result.find((e) => e.listingId === staleListing.id);
      const freshEvent = result.find((e) => e.listingId === freshListing.id);
      expect(staleEvent?.detectionMode).toBe('backfill');
      expect(freshEvent?.detectionMode).toBe('live');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('DisappearancesService.checkRelist', () => {
  function makeEvent(overrides: Partial<ListingDisappearance> = {}): ListingDisappearance {
    return {
      id: `event-${Math.random().toString(36).slice(2)}`,
      listingId: 'prev-listing',
      cohortKey: null,
      lastKnownPriceUsd: 1000,
      firstSeenAt: new Date(),
      disappearedAt: new Date(Date.now() - 5 * DAY),
      domDays: 1,
      priceCutsCount: 0,
      hadPriceCut: false,
      isRelist: false,
      relistListingId: null,
      relistDetectedAt: null,
      reappearedAt: null,
      detectionMode: 'live',
      createdAt: new Date(),
      ...overrides,
    } as ListingDisappearance;
  }

  it('marks the event as a relist on a VIN match within the window', async () => {
    const { service, listingsRepo, disappearancesRepo } = buildService();
    const prevListing = makeListing({ id: 'prev-listing', vin: 'VIN1234567890', mileage: 100 });
    listingsRepo.rows.push(prevListing);
    const event = makeEvent({ listingId: 'prev-listing' });
    disappearancesRepo.rows.push(event);

    const newListing = makeListing({ id: 'new-listing', vin: 'vin1234567890', mileage: 105 });

    await service.checkRelist(newListing);

    expect(event.isRelist).toBe(true);
    expect(event.relistListingId).toBe('new-listing');
    expect(event.relistDetectedAt).not.toBeNull();
  });

  it('marks the event as a relist on an attribute match (markId/modelId/year/cityId equal, mileage within tolerance)', async () => {
    const { service, listingsRepo, disappearancesRepo } = buildService();
    const prevListing = makeListing({
      id: 'prev-listing-2',
      vin: null,
      markId: 3,
      modelId: 4,
      year: 2020,
      cityId: 7,
      mileage: 50,
    });
    listingsRepo.rows.push(prevListing);
    const event = makeEvent({ listingId: 'prev-listing-2' });
    disappearancesRepo.rows.push(event);

    const newListing = makeListing({
      id: 'new-listing-2',
      vin: null,
      markId: 3,
      modelId: 4,
      year: 2020,
      cityId: 7,
      mileage: 51,
    });

    await service.checkRelist(newListing);

    expect(event.isRelist).toBe(true);
    expect(event.relistListingId).toBe('new-listing-2');
  });

  it('does not mark an event outside the relist window', async () => {
    const { service, listingsRepo, disappearancesRepo } = buildService();
    const prevListing = makeListing({ id: 'prev-listing-3', vin: 'VINOLD1234567' });
    listingsRepo.rows.push(prevListing);
    const event = makeEvent({
      listingId: 'prev-listing-3',
      disappearedAt: new Date(Date.now() - 40 * DAY),
    });
    disappearancesRepo.rows.push(event);

    const newListing = makeListing({ id: 'new-listing-3', vin: 'VINOLD1234567' });

    await service.checkRelist(newListing);

    expect(event.isRelist).toBe(false);
    expect(event.relistListingId).toBeNull();
  });

  it('does not mark an already-voided (reappeared) event', async () => {
    const { service, listingsRepo, disappearancesRepo } = buildService();
    const prevListing = makeListing({ id: 'prev-listing-4', vin: 'VINVOID1234567' });
    listingsRepo.rows.push(prevListing);
    const event = makeEvent({
      listingId: 'prev-listing-4',
      reappearedAt: new Date(),
    });
    disappearancesRepo.rows.push(event);

    const newListing = makeListing({ id: 'new-listing-4', vin: 'VINVOID1234567' });

    await service.checkRelist(newListing);

    expect(event.isRelist).toBe(false);
    expect(event.relistListingId).toBeNull();
  });
});
