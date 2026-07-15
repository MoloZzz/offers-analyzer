import { Command, Ctx, Start, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';

import { SubscribersService } from '../subscribers.service';

/** Minimal bot commands so users can subscribe (US3 will add /mute, /profiles, etc.). */
@Update()
export class TelegramBotUpdate {
  constructor(private readonly subscribers: SubscribersService) {}

  @Start()
  async onStart(@Ctx() ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId == null) return;
    await this.subscribers.activate(String(chatId));
    await ctx.reply('Готово — надсилатиму вигідні пропозиції авто. /stop щоб зупинити.');
  }

  @Command('stop')
  async onStop(@Ctx() ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId == null) return;
    await this.subscribers.unsubscribe(String(chatId));
    await ctx.reply('Зупинено. /start щоб відновити.');
  }
}
