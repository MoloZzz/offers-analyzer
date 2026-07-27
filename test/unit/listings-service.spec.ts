import { Currency } from '../../src/common/types/money';
import { ExchangeRate } from '../../src/modules/fx/ports/exchange-rate.port';
import { Listing } from '../../src/modules/listings/entities/listing.entity';
import { PriceObservation } from '../../src/modules/listings/entities/price-observation.entity';
import { ListingsService } from '../../src/modules/listings/listings.service';
import { ListingDetail } from '../../src/modules/sources/ports/listing-source.port';

function buildRepo<T extends { id?: string }>() {
  const rows: T[] = [];
  let nextId = 1;
  return {
    rows,
    repo: {
      findOne: ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(rows.find((row) => Object.entries(where).every(([k, v]) => (row as never)[k] === v)) ?? null),
      find: () => Promise.resolve([...rows]),
      create: (x: Partial<T>) => ({ id: `id-${nextId++}`, ...x } as T),
      save: (x: T) => {
        const idx = rows.findIndex((row) => row.id === x.id);
        if (idx === -1) rows.push(x);
        else rows[idx] = x;
        return Promise.resolve(x);
      },
      count: () => Promise.resolve(rows.length),
    } as never,
  };
}

function makeDetail(overrides: Partial<ListingDetail> = {}): ListingDetail {
  return {
    externalId: 'ext-1',
    make: 'Toyota',
    model: 'Camry',
    markId: 1,
    modelId: 2,
    year: 2018,
    sellerType: 'private',
    hasVinReport: false,
    url: 'https://example.test/1',
    price: { amount: 300000, currency: Currency.UAH },
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

describe('ListingsService.recordSeen', () => {
  it('normalizes UAH price observations into USD before storing them', async () => {
    const listings = buildRepo<Listing>();
    const observations = buildRepo<PriceObservation>();
    const fx: Pick<ExchangeRate, 'rate'> = {
      rate: jest.fn().mockResolvedValue(0.025),
    };
    const service = new ListingsService(listings.repo, observations.repo, fx as ExchangeRate);

    await service.recordSeen(makeDetail(), { seenInSearch: true });

    expect(fx.rate).toHaveBeenCalledWith(Currency.UAH, Currency.USD, expect.any(Date));
    expect(observations.rows).toHaveLength(1);
    expect(observations.rows[0].amount).toBe(300000);
    expect(observations.rows[0].currency).toBe(Currency.UAH);
    expect(observations.rows[0].amountUsd).toBe(7500);
  });
});
