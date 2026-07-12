import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Listing } from '../listings/entities/listing.entity';
import { Opportunity } from '../valuation/entities/opportunity.entity';

import { Notification } from './entities/notification.entity';
import { formatOpportunity } from './format/opportunity-message';
import { Notifier, NOTIFIER } from './ports/notifier.port';
import { Subscriber } from './entities/subscriber.entity';

/** Sends opportunity alerts to active subscribers, idempotently (unique dedupKey — FR-008). */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Subscriber) private readonly subscribers: Repository<Subscriber>,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  async notifyOpportunity(opportunity: Opportunity, listing: Listing): Promise<void> {
    const recipients = await this.subscribers.find({ where: { state: 'active' } });
    if (recipients.length === 0) return;

    const text = formatOpportunity(opportunity, listing);

    for (const sub of recipients) {
      const dedupKey = `${sub.id}:opportunity:${opportunity.id}`;
      const already = await this.notifications.count({ where: { dedupKey } });
      if (already > 0) continue;

      await this.notifier.send({ chatId: sub.telegramChatId, text });
      await this.notifications.save(
        this.notifications.create({
          subscriberId: sub.id,
          opportunityId: opportunity.id,
          type: 'opportunity',
          dedupKey,
        }),
      );
    }
  }
}
