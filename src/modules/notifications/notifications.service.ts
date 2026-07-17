import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Listing } from '../listings/entities/listing.entity';
import { Opportunity } from '../valuation/entities/opportunity.entity';

import { Notification } from './entities/notification.entity';
import { formatOpportunity, formatPriceDrop } from './format/opportunity-message';
import { Notifier, NOTIFIER } from './ports/notifier.port';
import { SubscribersService } from './subscribers.service';

/** Sends opportunity alerts to active subscribers, idempotently (unique dedupKey — FR-008). */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly subscribers: SubscribersService,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  async notifyOpportunity(opportunity: Opportunity, listing: Listing): Promise<void> {
    const recipients = await this.subscribers.listActive();
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

  async notifyPriceDrop(
    opportunity: Opportunity,
    listing: Listing,
    oldAmount: number,
  ): Promise<void> {
    const recipients = await this.subscribers.listActive();
    if (recipients.length === 0) return;

    const text = formatPriceDrop(opportunity, listing, oldAmount);

    for (const sub of recipients) {
      const dedupKey = `${sub.id}:price_drop:${opportunity.id}`;
      const already = await this.notifications.count({ where: { dedupKey } });
      if (already > 0) continue;

      await this.notifier.send({ chatId: sub.telegramChatId, text });
      await this.notifications.save(
        this.notifications.create({
          subscriberId: sub.id,
          opportunityId: opportunity.id,
          type: 'price_drop',
          dedupKey,
        }),
      );
    }
  }

  /** Send a plain broadcast (e.g. the weekly self-tuning report) to all active subscribers. */
  async broadcast(text: string): Promise<void> {
    const recipients = await this.subscribers.listActive();
    for (const sub of recipients) {
      await this.notifier.send({ chatId: sub.telegramChatId, text });
    }
  }
}
