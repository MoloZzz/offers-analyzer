import { Repository } from 'typeorm';

import { Subscriber } from '../../src/modules/notifications/entities/subscriber.entity';
import { SubscribersService } from '../../src/modules/notifications/subscribers.service';

function buildRepo() {
  const rows: Subscriber[] = [];
  const repo = {
    findOne: jest.fn(({ where }: { where: { telegramChatId: string } }) =>
      Promise.resolve(rows.find((row) => row.telegramChatId === where.telegramChatId) ?? null),
    ),
    create: jest.fn((x: Partial<Subscriber>) => ({ ...x } as Subscriber)),
    save: jest.fn((entity: Subscriber) => {
      const idx = rows.findIndex((row) => row.telegramChatId === entity.telegramChatId);
      if (idx === -1) rows.push(entity);
      else rows[idx] = entity;
      return Promise.resolve(entity);
    }),
    find: jest.fn(),
  } as unknown as Repository<Subscriber>;

  return { repo, rows };
}

describe('SubscribersService', () => {
  it('stores all-niche subscriptions when activating without a profile', async () => {
    const { repo, rows } = buildRepo();
    const service = new SubscribersService(repo);

    await service.subscribeAll('chat-1');

    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe('active');
    expect(rows[0].profileIds).toBeNull();
  });

  it('stores a named-profile subscription as a single profile id', async () => {
    const { repo, rows } = buildRepo();
    const service = new SubscribersService(repo);

    await service.subscribeToProfile('chat-1', 'profile-123');

    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe('active');
    expect(rows[0].profileIds).toEqual(['profile-123']);
  });

  it('moves a subscriber to unsubscribed without clearing their profile selection', async () => {
    const { repo, rows } = buildRepo();
    const service = new SubscribersService(repo);

    await service.subscribeToProfile('chat-1', 'profile-123');
    await service.unsubscribe('chat-1');

    expect(rows[0].state).toBe('unsubscribed');
    expect(rows[0].profileIds).toEqual(['profile-123']);
  });
});
