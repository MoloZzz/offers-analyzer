import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration from './common/config/configuration';
import { validateEnv } from './common/config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
    // Foundational & feature modules are wired in subsequent phases:
    // DatabaseModule, SchedulingModule, SourcesModule, ListingsModule,
    // ValuationModule, ProfilesModule, NotificationsModule, FxModule.
  ],
})
export class AppModule {}
