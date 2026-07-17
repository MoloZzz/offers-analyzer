import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegrafModule } from 'nestjs-telegraf';

import { AppConfig } from '../../common/config/configuration';
import { CalibrationModule } from '../calibration/calibration.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { QueryModule } from '../query/query.module';

import { CalibrationSchedulerService } from './calibration-scheduler.service';
import { Notification } from './entities/notification.entity';
import { Subscriber } from './entities/subscriber.entity';
import { NotificationsService } from './notifications.service';
import { NOTIFIER } from './ports/notifier.port';
import { ReportSchedulerService } from './report-scheduler.service';
import { SubscribersService } from './subscribers.service';
import { TelegramBotUpdate } from './telegram/telegram-bot.update';
import { TelegramNotifier } from './telegram/telegram.notifier';

@Module({
  imports: [
    ProfilesModule,
    QueryModule,
    CalibrationModule,
    TypeOrmModule.forFeature([Subscriber, Notification]),
    TelegrafModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        token: config.get('telegramBotToken', { infer: true }),
      }),
    }),
  ],
  providers: [
    NotificationsService,
    SubscribersService,
    ReportSchedulerService,
    CalibrationSchedulerService,
    TelegramBotUpdate,
    TelegramNotifier,
    { provide: NOTIFIER, useExisting: TelegramNotifier },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
