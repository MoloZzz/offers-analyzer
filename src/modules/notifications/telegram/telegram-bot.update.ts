import { Command, Ctx, Help, Start, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';

import { ProfilesService } from '../../profiles/profiles.service';
import { SubscribersService } from '../subscribers.service';

const HELP =
  '/start — підписатися на вигідні пропозиції\n' +
  '/stop — відписатися\n' +
  '/mute — тимчасово вимкнути сповіщення\n' +
  '/profiles — які ніші зараз моніторимо\n' +
  '/help — ця довідка';

/** Telegram bot commands (FR-015). */
@Update()
export class TelegramBotUpdate {
  constructor(
    private readonly subscribers: SubscribersService,
    private readonly profiles: ProfilesService,
  ) {}

  @Start()
  async onStart(@Ctx() ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId == null) return;
    await this.subscribers.activate(String(chatId));
    await ctx.reply('Готово — надсилатиму вигідні пропозиції авто. /help для команд.');
  }

  @Command('stop')
  async onStop(@Ctx() ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId == null) return;
    await this.subscribers.unsubscribe(String(chatId));
    await ctx.reply('Зупинено. /start щоб відновити.');
  }

  @Command('mute')
  async onMute(@Ctx() ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (chatId == null) return;
    await this.subscribers.mute(String(chatId));
    await ctx.reply('Сповіщення вимкнено. /start щоб відновити.');
  }

  @Command('profiles')
  async onProfiles(@Ctx() ctx: Context): Promise<void> {
    const profiles = await this.profiles.getEnabled();
    const list =
      profiles.length > 0
        ? profiles.map((p) => `• ${p.name}`).join('\n')
        : 'Активних ніш немає.';
    await ctx.reply(`Ніші, що моніторяться:\n${list}`);
  }

  @Help()
  async onHelp(@Ctx() ctx: Context): Promise<void> {
    await ctx.reply(HELP);
  }
}
