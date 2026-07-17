import { Injectable } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Markup, Telegraf } from 'telegraf';

import { Notifier, OutboundMessage } from '../ports/notifier.port';

/** Telegram implementation of the Notifier port. */
@Injectable()
export class TelegramNotifier implements Notifier {
  readonly channel = 'telegram';

  constructor(@InjectBot() private readonly bot: Telegraf) {}

  async send(message: OutboundMessage): Promise<void> {
    const extra = message.buttons
      ? Markup.inlineKeyboard(
          message.buttons.map((row) => row.map((b) => Markup.button.callback(b.text, b.data))),
        )
      : undefined;
    await this.bot.telegram.sendMessage(message.chatId, message.text, extra);
  }
}
