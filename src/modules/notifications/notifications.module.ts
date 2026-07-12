import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegrafModule } from 'nestjs-telegraf';

import { AppConfig } from '../../common/config/configuration';

import { Notification } from './entities/notification.entity';
import { Subscriber } from './entities/subscriber.entity';
import { NotificationsService } from './notifications.service';
import { NOTIFIER } from './ports/notifier.port';
import { TelegramNotifier } from './telegram/telegram.notifier';

@Module({
  imports: [
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
    TelegramNotifier,
    { provide: NOTIFIER, useExisting: TelegramNotifier },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
