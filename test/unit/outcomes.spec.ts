import { Repository } from 'typeorm';

import { Outcome } from '../../src/modules/calibration/entities/outcome.entity';
import { OutcomesService } from '../../src/modules/calibration/outcomes.service';

/** Minimal in-memory fake — only the where-shapes the service actually issues. */
function buildFakeRepo(): { repo: Repository<Outcome>; rows: Outcome[] } {
  const rows: Outcome[] = [];
  let nextId = 1;

  const matches = (row: Outcome, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => (row as never)[key] === value);

  const repo = {
    async findOne({ where }: { where: Record<string, unknown> }) {
      return rows.find((row) => matches(row, where)) ?? null;
    },
    create(x: Partial<Outcome>) {
      return { id: `id-${nextId++}`, createdAt: new Date(), ...x } as Outcome;
    },
    async save(x: Outcome) {
      const idx = rows.findIndex((row) => row.id === x.id);
      if (idx === -1) {
        rows.push(x);
      } else {
        rows[idx] = x;
      }
      return x;
    },
    async find({ where }: { where: Record<string, unknown> }) {
      return rows.filter((row) => matches(row, where));
    },
  } as unknown as Repository<Outcome>;

  return { repo, rows };
}

describe('OutcomesService', () => {
  it('recordManual is idempotent per opportunity — re-labeling updates, does not duplicate', async () => {
    const { repo, rows } = buildFakeRepo();
    const service = new OutcomesService(repo);

    await service.recordManual({
      listingId: 'listing-1',
      opportunityId: 'opp-1',
      label: 'skipped',
    });
    await service.recordManual({
      listingId: 'listing-1',
      opportunityId: 'opp-1',
      label: 'bought',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('bought');
  });

  it('recordPassive dedups on (listingId, label)', async () => {
    const { repo, rows } = buildFakeRepo();
    const service = new OutcomesService(repo);

    await service.recordPassive({ listingId: 'listing-2', label: 'disappeared' });
    await service.recordPassive({ listingId: 'listing-2', label: 'disappeared' });

    expect(rows).toHaveLength(1);
  });

  it('recordManual without opportunityId always creates a new row', async () => {
    const { repo, rows } = buildFakeRepo();
    const service = new OutcomesService(repo);

    await service.recordManual({ listingId: 'listing-3', label: 'good' });
    await service.recordManual({ listingId: 'listing-3', label: 'bad' });

    expect(rows).toHaveLength(2);
  });
});
