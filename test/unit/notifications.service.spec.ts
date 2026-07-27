import { Repository } from 'typeorm';

import { Listing } from '../../src/modules/listings/entities/listing.entity';
import { Notification } from '../../src/modules/notifications/entities/notification.entity';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { SubscribersService } from '../../src/modules/notifications/subscribers.service';
import { Opportunity } from '../../src/modules/valuation/entities/opportunity.entity';


describe('NotificationsService', () => {
  it('sends opportunity alerts only to active subscribers matching the profile or all profiles', async () => {
    const subscribers = {
      listActive: jest.fn().mockResolvedValue([
        { id: 'sub-all', telegramChatId: '100', profileIds: null },
        { id: 'sub-match', telegramChatId: '101', profileIds: ['profile-1'] },
        { id: 'sub-skip', telegramChatId: '102', profileIds: ['profile-2'] },
      ]),
    } as unknown as SubscribersService;

    const notifications = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((x) => x),
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as Repository<Notification>;

    const notifier = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    const service = new NotificationsService(
      subscribers,
      notifications,
      notifier as any,
    );

    const listing = {
      id: 'listing-1',
      make: 'BMW',
      model: '3 Series',
      year: 2017,
      mileage: 127,
      stateId: 12,
      cityId: 34,
      sellerType: 'private',
      url: 'https://auto.ria.com/auto_x.html',
    } as unknown as Listing;

    const opportunity = {
      id: 'opp-1',
      listingId: 'listing-1',
      profileId: 'profile-1',
      askingValue: 12000,
      fairValue: 16000,
      discountPct: 25,
      confidence: 0.9,
      score: 0.75,
      sampleSize: 42,
      currency: 'USD',
      redFlags: { no_vin_report: true },
    } as unknown as Opportunity;

    await service.notifyOpportunity(opportunity, listing);

    expect(notifier.send).toHaveBeenCalledTimes(2);
    expect((notifier.send).mock.calls.map((call) => call[0].chatId)).toEqual([
      '100',
      '101',
    ]);
  });
});
