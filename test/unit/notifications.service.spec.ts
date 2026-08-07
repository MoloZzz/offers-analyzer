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
      // Spec 017: admin chat ids decide whether the 🤖 AI-аналіз button is attached.
      { get: () => [] } as never,
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

/**
 * SPEC-017 T032. The AI button is admin-only, and the cheapest place to enforce that is not to
 * render it for anyone else — a button that answers "administrators only" is a worse interface than
 * no button. The callback handler gates again; this is the first of the two.
 */
describe('NotificationsService — the 🤖 AI-аналіз button (spec 017)', () => {
  async function deliverTo(chatIds: string[], adminIds: string[]) {
    const sent: Array<{ chatId: string; buttons: Array<Array<{ text: string; data: string }>> }> = [];
    const service = new NotificationsService(
      {
        listActive: jest
          .fn()
          .mockResolvedValue(chatIds.map((id) => ({ id: `sub-${id}`, telegramChatId: id, profileIds: null }))),
      } as unknown as SubscribersService,
      {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn((x) => x),
        save: jest.fn().mockResolvedValue(undefined),
      } as unknown as Repository<Notification>,
      {
        send: jest.fn((m: { chatId: string; buttons: Array<Array<{ text: string; data: string }>> }) => {
          sent.push(m);
          return Promise.resolve();
        }),
      } as never,
      { get: () => adminIds } as never,
    );

    await service.notifyOpportunity(
      {
        id: 'opp-1',
        profileId: 'profile-1',
        score: 0.7,
        askingValue: 11000,
        fairValue: 14000,
        discountPct: 21,
        confidence: 0.9,
        sampleSize: 42,
        currency: 'USD',
        redFlags: {},
      } as unknown as Opportunity,
      { id: 'listing-1', make: 'VW', model: 'Passat', year: 2017, url: 'https://auto.ria.com/x' } as unknown as Listing,
    );
    return sent;
  }

  const aiRow = (buttons: Array<Array<{ text: string; data: string }>>) =>
    buttons.find((row) => row.some((b) => b.data.startsWith('ai:')));

  it('attaches the button for an admin recipient', async () => {
    const [message] = await deliverTo(['77'], ['77']);

    expect(aiRow(message.buttons)?.[0]).toEqual({ text: '🤖 AI-аналіз', data: 'ai:listing-1' });
  });

  it('omits it for everyone else, while the free Деталі button stays', async () => {
    const [message] = await deliverTo(['100'], ['77']);

    expect(aiRow(message.buttons)).toBeUndefined();
    expect(message.buttons.flat().some((b) => b.data.startsWith('details:'))).toBe(true);
  });

  it('decides per recipient, not per alert', async () => {
    const sent = await deliverTo(['77', '100'], ['77']);

    expect(aiRow(sent[0].buttons)).toBeDefined();
    expect(aiRow(sent[1].buttons)).toBeUndefined();
  });
});
