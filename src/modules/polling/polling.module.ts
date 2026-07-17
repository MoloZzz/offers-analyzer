import { Module } from '@nestjs/common';

import { CalibrationModule } from '../calibration/calibration.module';
import { FxModule } from '../fx/fx.module';
import { ListingsModule } from '../listings/listings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { SourcesModule } from '../sources/sources.module';
import { ValuationModule } from '../valuation/valuation.module';

import { PollService } from './poll.service';

/** Wires the US1 pipeline. Depends on the feature modules; no cycle with SchedulingModule. */
@Module({
  imports: [
    ProfilesModule,
    SourcesModule,
    ListingsModule,
    ValuationModule,
    NotificationsModule,
    FxModule,
    CalibrationModule,
  ],
  providers: [PollService],
})
export class PollingModule {}
