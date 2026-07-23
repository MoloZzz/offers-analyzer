import { Repository } from 'typeorm';

import { DealsService } from '../../src/modules/calibration/deals.service';
import { DealOutcome } from '../../src/modules/calibration/entities/deal-outcome.entity';

/** Minimal in-memory fake — only the shapes DealsService issues (mirrors outcomes.spec pattern). */
function buildFakeRepo(): { repo: Repository<DealOutcome>; rows: DealOutcome[] } {
  const rows: DealOutcome[] = [];
  let nextId = 1;

  const matches = (row: DealOutcome, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => (row as never)[key] === value);

  const repo = {
    async findOne({ where }: { where: Record<string, unknown> }) {
      return rows.find((row) => matches(row, where)) ?? null;
    },
    create(x: Partial<DealOutcome>) {
      return {
        id: `id-${nextId++}`,
        opportunityId: null,
        declineReason: null,
        buyPriceUsd: null,
        actualCostsUsd: null,
        sellPriceUsd: null,
        daysOnMarket: null,
        boughtAt: null,
        soldAt: null,
        lastRemindedAt: null,
        note: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...x,
      } as DealOutcome;
    },
    async save(x: DealOutcome) {
      const idx = rows.findIndex((row) => row.id === x.id);
      if (idx === -1) rows.push(x);
      else rows[idx] = x;
      return x;
    },
    async find({ where, order, take }: { where?: Record<string, unknown>; order?: never; take?: number }) {
      let out = where ? rows.filter((row) => matches(row, where)) : [...rows];
      if (order) out = [...out].reverse(); // good enough for the recent() ordering assertion
      if (take != null) out = out.slice(0, take);
      return out;
    },
    async update({ id }: { id: string }, patch: Partial<DealOutcome>) {
      const row = rows.find((r) => r.id === id);
      if (row) Object.assign(row, patch);
      return { affected: row ? 1 : 0 };
    },
  } as unknown as Repository<DealOutcome>;

  return { repo, rows };
}

describe('DealsService', () => {
  it('upsertForListing is idempotent per listing — patches, does not duplicate', async () => {
    const { repo, rows } = buildFakeRepo();
    const service = new DealsService(repo);

    await service.upsertForListing('listing-1', { buyPriceUsd: 8000 }, 'opp-1');
    await service.upsertForListing('listing-1', { sellPriceUsd: 10000 });

    expect(rows).toHaveLength(1);
    expect(rows[0].buyPriceUsd).toBe(8000);
    expect(rows[0].sellPriceUsd).toBe(10000);
    expect(rows[0].opportunityId).toBe('opp-1');
    expect(rows[0].stage).toBe('sold');
  });

  it('progresses declined → bought → sold and never downgrades', async () => {
    const { rows, repo } = buildFakeRepo();
    const service = new DealsService(repo);

    await service.markDeclined('l', 'price', 'op');
    expect(rows[0].stage).toBe('declined');

    await service.markBought('l');
    expect(rows[0].stage).toBe('bought'); // buying overrides an earlier decline

    await service.upsertForListing('l', { sellPriceUsd: 9000 });
    expect(rows[0].stage).toBe('sold');

    await service.upsertForListing('l', { buyPriceUsd: 7500 }); // late buy patch
    expect(rows[0].stage).toBe('sold'); // stays sold
    expect(rows[0].buyPriceUsd).toBe(7500);
  });

  it('stamps boughtAt once, soldAt once', async () => {
    const { rows, repo } = buildFakeRepo();
    const service = new DealsService(repo);

    const t1 = new Date('2026-06-01T00:00:00Z');
    await service.markBought('l', null, t1);
    const bought = rows[0].boughtAt;

    const t2 = new Date('2026-06-10T00:00:00Z');
    await service.upsertForListing('l', {}, null, t2);
    expect(rows[0].boughtAt).toEqual(bought); // not re-stamped

    const t3 = new Date('2026-06-20T00:00:00Z');
    await service.upsertForListing('l', { sellPriceUsd: 9000 }, null, t3);
    expect(rows[0].soldAt).toEqual(t3);
    expect(rows[0].boughtAt).toEqual(bought);
  });

  it('closedDeals excludes sold rows missing a price', async () => {
    const { repo } = buildFakeRepo();
    const service = new DealsService(repo);

    await service.upsertForListing('complete', { buyPriceUsd: 8000, sellPriceUsd: 9000 });
    await service.upsertForListing('no-buy', { sellPriceUsd: 9000 }); // sold, but no buy price

    const closed = await service.closedDeals();
    expect(closed.map((d) => d.listingId)).toEqual(['complete']);
  });

  it('dueForReminder respects boughtAt vs lastRemindedAt window', async () => {
    const { rows, repo } = buildFakeRepo();
    const service = new DealsService(repo);
    const now = new Date('2026-07-01T00:00:00Z');

    await service.markBought('old', null, new Date('2026-05-01T00:00:00Z')); // 61 days ago
    await service.markBought('recent', null, new Date('2026-06-25T00:00:00Z')); // 6 days ago

    let due = await service.dueForReminder(now, 30);
    expect(due.map((d) => d.listingId)).toEqual(['old']);

    // Remind it, then it should fall out of the window until 30 more days pass.
    await service.markReminded(rows.find((r) => r.listingId === 'old')!.id, now);
    due = await service.dueForReminder(now, 30);
    expect(due).toHaveLength(0);
  });
});
