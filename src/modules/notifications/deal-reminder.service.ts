import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AppConfig } from '../../common/config/configuration';
import { DealsService } from '../calibration/deals.service';
import { ListingsService } from '../listings/listings.service';

import { NotificationsService } from './notifications.service';

/** Daily 10:00 — nudge the operator to close bought-but-unsold deals (SPEC-007 US7.1). */
const DAILY_REMINDER_CRON = '0 10 * * *';

/**
 * Reminds the operator about deals bought but not yet marked sold once they exceed
 * `DEAL_REMINDER_DAYS`. Re-reminds at most once per window (bumps `lastRemindedAt`), so a
 * long-held deal is nudged periodically, never daily. Zero API cost — reads stored deals only.
 */
@Injectable()
export class DealReminderService {
  private readonly reminderDays: number;

  constructor(
    private readonly deals: DealsService,
    private readonly listings: ListingsService,
    private readonly notifications: NotificationsService,
    config: ConfigService<AppConfig, true>,
    @InjectPinoLogger(DealReminderService.name) private readonly logger: PinoLogger,
  ) {
    this.reminderDays = config.get('dealReminderDays', { infer: true });
  }

  @Cron(DAILY_REMINDER_CRON, { name: 'deal-reminder' })
  async remind(now: Date = new Date()): Promise<void> {
    try {
      const due = await this.deals.dueForReminder(now, this.reminderDays);
      if (due.length === 0) return;

      const listings = await this.listings.findByIds(due.map((d) => d.listingId));
      const byId = new Map(listings.map((l) => [l.id, l]));

      const lines = due.map((d) => {
        const l = byId.get(d.listingId);
        const name = l ? `${l.make} ${l.model}, ${l.year}` : 'авто';
        const link = l ? `\n  ${l.url}` : '';
        return `• ${name}${link}`;
      });
      await this.notifications.broadcast(
        `⏰ Куплено понад ${this.reminderDays} дн. і ще не продано:\n${lines.join('\n')}\n` +
          `Закрий угоду: /deal <посилання> sell=10200 dom=21`,
      );
      for (const d of due) await this.deals.markReminded(d.id, now);
      this.logger.info({ count: due.length }, 'Deal reminders sent');
    } catch (err) {
      this.logger.error({ err }, 'Deal reminder failed');
    }
  }
}
