import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppConfig } from '../../common/config/configuration';
import { Listing } from '../listings/entities/listing.entity';
import { Opportunity } from '../valuation/entities/opportunity.entity';

import { Notification } from './entities/notification.entity';
import { Subscriber } from './entities/subscriber.entity';
import { formatOpportunity, formatPriceDrop } from './format/opportunity-message';
import { Notifier, NOTIFIER, OutboundButton } from './ports/notifier.port';
import { SubscribersService } from './subscribers.service';
import { buildAnalyzeCallback } from './telegram/analyze-callback';
import { buildDealCallback } from './telegram/deal-callback';
import { buildDetailsCallback } from './telegram/details-callback';
import { buildOutcomeCallback } from './telegram/outcome-callback';

/**
 * Inline keyboard on every alert: the 👍/👎 feedback row (spec 002), the deal-outcome row
 * (SPEC-007) — 🛒 Купив / ❌ Відмова — and the 📋 Деталі row (spec 016 US16.2), which pulls the full
 * per-parameter breakdown out of storage.
 *
 * Buttons are the whole delivery mechanism for spec 016: the pushed **body** keeps its current line
 * count (SC-001), because detail the operator did not ask for is spam on a phone screen.
 */
function alertButtons(
  opportunityId: string,
  listingId: string,
  isAdmin = false,
): OutboundButton[][] {
  const rows: OutboundButton[][] = [
    [
      { text: '👍 Вдала', data: buildOutcomeCallback('good', opportunityId) },
      { text: '👎 Невдала', data: buildOutcomeCallback('bad', opportunityId) },
    ],
    [
      { text: '🛒 Купив', data: buildDealCallback('bought', opportunityId) },
      { text: '❌ Відмова', data: buildDealCallback('decline', opportunityId) },
    ],
    [{ text: '📋 Деталі', data: buildDetailsCallback(listingId) }],
  ];
  // Spec 017 T032. Only admins get the row: the handler gates on `isAdmin` anyway, but offering a
  // button that answers "this command is for administrators only" to everyone else is a worse
  // interface than not offering it. Its own row, below `Деталі`, because it is a different kind of
  // action — it spends money and returns an opinion, not a stored breakdown.
  if (isAdmin) rows.push([{ text: '🤖 AI-аналіз', data: buildAnalyzeCallback(listingId) }]);
  return rows;
}

/** Sends opportunity alerts to active subscribers, idempotently (unique dedupKey — FR-008). */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly subscribers: SubscribersService,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private isAdminChat(chatId: string): boolean {
    return this.config.get('telegramAdminChatIds', { infer: true }).includes(chatId);
  }

  async notifyOpportunity(opportunity: Opportunity, listing: Listing): Promise<void> {
    const recipients = await this.activeRecipientsForProfile(opportunity.profileId);
    if (recipients.length === 0) return;

    const text = formatOpportunity(opportunity, listing);

    for (const sub of recipients) {
      const dedupKey = `${sub.id}:opportunity:${opportunity.id}`;
      const already = await this.notifications.count({ where: { dedupKey } });
      if (already > 0) continue;

      await this.notifier.send({
        chatId: sub.telegramChatId,
        text,
        buttons: alertButtons(opportunity.id, listing.id, this.isAdminChat(sub.telegramChatId)),
      });
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
    const recipients = await this.activeRecipientsForProfile(opportunity.profileId);
    if (recipients.length === 0) return;

    const text = formatPriceDrop(opportunity, listing, oldAmount);

    for (const sub of recipients) {
      const dedupKey = `${sub.id}:price_drop:${opportunity.id}`;
      const already = await this.notifications.count({ where: { dedupKey } });
      if (already > 0) continue;

      await this.notifier.send({
        chatId: sub.telegramChatId,
        text,
        buttons: alertButtons(opportunity.id, listing.id, this.isAdminChat(sub.telegramChatId)),
      });
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

  private async activeRecipientsForProfile(profileId: string): Promise<Subscriber[]> {
    const recipients = await this.subscribers.listActive();
    return recipients.filter((sub) => !sub.profileIds?.length || sub.profileIds.includes(profileId));
  }
}
