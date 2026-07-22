import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

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
  constructor(
    private readonly query: QueryService,
    private readonly notifications: NotificationsService,
    @InjectPinoLogger(ReportSchedulerService.name) private readonly logger: PinoLogger,
  ) {}

  @Cron(WEEKLY_REPORT_CRON, { name: 'weekly-report' })
  async weeklyReport(): Promise<void> {
    const digest = await this.query.report();
    if (digest.evaluated === 0) return; // nothing to report yet — don't spam an empty digest
    await this.notifications.broadcast(formatReport(digest));
    this.logger.info({ evaluated: digest.evaluated }, 'Weekly report sent');
  }
}
