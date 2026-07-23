import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegrafModule } from 'nestjs-telegraf';

import { AppConfig } from '../../common/config/configuration';
import { CalibrationModule } from '../calibration/calibration.module';
import { HealthModule } from '../health/health.module';
import { ListingsModule } from '../listings/listings.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { QueryModule } from '../query/query.module';

import { AlertedCarsService } from './alerted-cars.service';
import { CalibrationSchedulerService } from './calibration-scheduler.service';
import { DealReminderService } from './deal-reminder.service';
import { AlertedCar } from './entities/alerted-car.entity';
import { Notification } from './entities/notification.entity';
import { Subscriber } from './entities/subscriber.entity';
import { HealthMonitorService } from './health-monitor.service';
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
    HealthModule,
    ListingsModule,
    TypeOrmModule.forFeature([Subscriber, Notification, AlertedCar]),
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
    DealReminderService,
    HealthMonitorService,
    TelegramBotUpdate,
    TelegramNotifier,
    AlertedCarsService,
    { provide: NOTIFIER, useExisting: TelegramNotifier },
  ],
  exports: [NotificationsService, AlertedCarsService],
})
export class NotificationsModule {}
