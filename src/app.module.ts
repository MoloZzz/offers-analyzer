import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import configuration from './common/config/configuration';
import { validateEnv } from './common/config/env.validation';
import { DatabaseModule } from './common/database/database.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    SchedulingModule,
    // US1 feature modules wired next: Sources, Listings, Valuation, Notifications.
  ],
})
export class AppModule {}
