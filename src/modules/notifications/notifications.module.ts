import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegrafModule } from 'nestjs-telegraf';

import { AppConfig } from '../../common/config/configuration';
import { ProfilesModule } from '../profiles/profiles.module';
import { QueryModule } from '../query/query.module';

import { Notification } from './entities/notification.entity';
import { Subscriber } from './entities/subscriber.entity';
import { NotificationsService } from './notifications.service';
import { NOTIFIER } from './ports/notifier.port';
import { SubscribersService } from './subscribers.service';
import { TelegramBotUpdate } from './telegram/telegram-bot.update';
import { TelegramNotifier } from './telegram/telegram.notifier';

@Module({
  imports: [
    ProfilesModule,
    QueryModule,
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
    TelegramBotUpdate,
    TelegramNotifier,
    { provide: NOTIFIER, useExisting: TelegramNotifier },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
