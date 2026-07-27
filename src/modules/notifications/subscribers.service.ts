import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Subscriber } from './entities/subscriber.entity';

/** Owns Telegram subscribers (FR-015). */
@Injectable()
export class SubscribersService {
  constructor(
    @InjectRepository(Subscriber) private readonly subscribers: Repository<Subscriber>,
  ) {}

  listActive(): Promise<Subscriber[]> {
    return this.subscribers.find({ where: { state: 'active' } });
  }

  async activate(telegramChatId: string, profileIds: string[] | null = null): Promise<void> {
    const existing = await this.subscribers.findOne({ where: { telegramChatId } });
    const entity = existing ?? this.subscribers.create({ telegramChatId });
    entity.state = 'active';
    entity.profileIds = profileIds != null && profileIds.length > 0 ? [...new Set(profileIds)] : null;
    await this.subscribers.save(entity);
  }

  async subscribeAll(telegramChatId: string): Promise<void> {
    await this.activate(telegramChatId, null);
  }

  async subscribeToProfile(telegramChatId: string, profileId: string): Promise<void> {
    await this.activate(telegramChatId, [profileId]);
  }

  async unsubscribe(telegramChatId: string): Promise<void> {
    await this.setState(telegramChatId, 'unsubscribed');
  }

  async mute(telegramChatId: string): Promise<void> {
    await this.setState(telegramChatId, 'muted');
  }

  private async setState(telegramChatId: string, state: Subscriber['state']): Promise<void> {
    const existing = await this.subscribers.findOne({ where: { telegramChatId } });
    if (!existing) return;
    existing.state = state;
    await this.subscribers.save(existing);
  }
}
