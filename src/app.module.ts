import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';

import configuration, { AppConfig } from './common/config/configuration';
import { validateEnv } from './common/config/env.validation';
import { DatabaseModule } from './common/database/database.module';
import { CalibrationModule } from './modules/calibration/calibration.module';
import { PollingModule } from './modules/polling/polling.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const isProduction = config.get('nodeEnv', { infer: true }) === 'production';
        return {
          pinoHttp: {
            level: config.get('logLevel', { infer: true }),
            // No HTTP surface worth auto-logging (background poller + Telegram bot) — services log
            // their own structured events instead.
            autoLogging: false,
            transport: isProduction
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true, colorize: true } },
            redact: ['req.headers.authorization', 'config.autoRiaApiKey', 'config.telegramBotToken'],
          },
        };
      },
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    SchedulingModule,
    // PollingModule brings the US1 pipeline: Sources, Listings, Valuation, Notifications, Profiles.
    PollingModule,
    CalibrationModule,
  ],
})
export class AppModule {}
