import { ConfigService } from '@nestjs/config';

import { DealsService } from '../../src/modules/calibration/deals.service';
import { DealOutcome } from '../../src/modules/calibration/entities/deal-outcome.entity';
import { Listing } from '../../src/modules/listings/entities/listing.entity';
import { ListingsService } from '../../src/modules/listings/listings.service';
import { DealReminderService } from '../../src/modules/notifications/deal-reminder.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';

const noopLogger = { info: () => undefined, error: () => undefined } as never;
const config = { get: () => 30 } as unknown as ConfigService<never, true>;

function make(
  deals: Partial<DealsService>,
  listings: Partial<ListingsService>,
  notifications: Partial<NotificationsService>,
): DealReminderService {
  return new DealReminderService(
    deals as DealsService,
    listings as ListingsService,
    notifications as NotificationsService,
    config,
    noopLogger,
  );
}

describe('DealReminderService', () => {
  it('broadcasts and marks reminded when deals are due', async () => {
    const due = [{ id: 'd1', listingId: 'l1' }] as DealOutcome[];
    const broadcasts: string[] = [];
    const reminded: string[] = [];
    const service = make(
      {
        dueForReminder: async () => due,
        markReminded: async (id) => {
          reminded.push(id);
        },
      },
      { findByIds: async () => [{ id: 'l1', make: 'Hyundai', model: 'Sonata', year: 2015, url: 'u' } as Listing] },
      { broadcast: async (text) => { broadcasts.push(text); } },
    );

    await service.remind(new Date('2026-07-01'));

    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]).toContain('Hyundai Sonata, 2015');
    expect(reminded).toEqual(['d1']);
  });

  it('does nothing when no deals are due', async () => {
    let broadcast = 0;
    const service = make(
      { dueForReminder: async () => [] },
      { findByIds: async () => [] },
      { broadcast: async () => { broadcast += 1; } },
    );

    await service.remind(new Date('2026-07-01'));
    expect(broadcast).toBe(0);
  });
});
