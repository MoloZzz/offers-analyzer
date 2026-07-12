import { Injectable } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

import { Notifier, OutboundMessage } from '../ports/notifier.port';

/** Telegram implementation of the Notifier port. */
@Injectable()
export class TelegramNotifier implements Notifier {
  readonly channel = 'telegram';

  constructor(@InjectBot() private readonly bot: Telegraf) {}

  async send(message: OutboundMessage): Promise<void> {
    await this.bot.telegram.sendMessage(message.chatId, message.text);
  }
}
