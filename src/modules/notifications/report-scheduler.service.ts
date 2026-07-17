import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { QueryService } from '../query/query.service';
import { formatReport } from '../query/report';

import { NotificationsService } from './notifications.service';

/** Monday 09:00 — weekly self-tuning report (R1b). Edit to change cadence. */
const WEEKLY_REPORT_CRON = '0 9 * * 1';

/**
 * Pushes the self-tuning report (the same digest as `/report`) to all active subscribers once a week,
 * so the operator gets the tuning recommendations without asking. Skips weeks with no evaluated data.
 */
@Injectable()
export class ReportSchedulerService {
  private readonly logger = new Logger(ReportSchedulerService.name);

  constructor(
    private readonly query: QueryService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(WEEKLY_REPORT_CRON, { name: 'weekly-report' })
  async weeklyReport(): Promise<void> {
    const digest = await this.query.report();
    if (digest.evaluated === 0) return; // nothing to report yet — don't spam an empty digest
    await this.notifications.broadcast(formatReport(digest));
    this.logger.log(`Weekly report sent (evaluated=${digest.evaluated})`);
  }
}
