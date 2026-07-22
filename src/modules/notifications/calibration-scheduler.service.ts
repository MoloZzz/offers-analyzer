import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { CalibrationService } from '../calibration/calibration.service';

import { formatCalibration } from './format/calibration-message';
import { NotificationsService } from './notifications.service';

/** Monday 09:30 — weekly threshold calibration (spec 002, E3). Mode from config (propose|auto). */
const CALIBRATION_CRON = '30 9 * * 1';

@Injectable()
export class CalibrationSchedulerService {
  constructor(
    private readonly calibration: CalibrationService,
    private readonly notifications: NotificationsService,
    @InjectPinoLogger(CalibrationSchedulerService.name) private readonly logger: PinoLogger,
  ) {}

  @Cron(CALIBRATION_CRON, { name: 'weekly-calibration' })
  async weeklyCalibration(): Promise<void> {
    const mode = this.calibration.configuredMode();
    const lines = await this.calibration.runAndSummarize(mode);
    const changed = lines.filter((l) => l.after != null);
    if (changed.length === 0) return; // nothing to report this week
    await this.notifications.broadcast(formatCalibration(lines, mode));
    this.logger.info({ mode, proposalCount: changed.length }, 'Weekly calibration ran');
  }
}
