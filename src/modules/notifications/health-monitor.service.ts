import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { HealthService } from '../health/health.service';
import { decideHealthAlert } from '../health/health-alert';

import { NotificationsService } from './notifications.service';

/** Alert the operator if the poll hasn't had a successful cycle in a while (dead-man's-switch). */
const STALE_MINUTES = 45; // ~4.5 missed 10-min cycles

@Injectable()
export class HealthMonitorService {
  private readonly logger = new Logger(HealthMonitorService.name);
  private alerted = false;

  constructor(
    private readonly health: HealthService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('*/15 * * * *', { name: 'health-monitor' })
  async check(): Promise<void> {
    const minutes = this.health.minutesSinceSuccess();
    const { message, alerted } = decideHealthAlert(minutes, this.alerted, STALE_MINUTES);
    this.alerted = alerted;
    if (message === 'down') {
      await this.notifications.broadcast(
        `⚠️ Моніторинг не оновлювався ${Math.round(minutes)} хв — можливо збій поллінгу або джерело недоступне. Перевірте сервіс.`,
      );
      this.logger.warn(`Health alert: stale ${Math.round(minutes)}m`);
    } else if (message === 'recovered') {
      await this.notifications.broadcast('✅ Моніторинг відновився — цикли знову проходять.');
    }
  }
}
