import { Command, Ctx, Help, Start, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';

import { ProfilesService } from '../../profiles/profiles.service';
import { QueryService } from '../../query/query.service';
import { formatAssessment } from '../format/opportunity-message';
import { SubscribersService } from '../subscribers.service';

const HELP =
  '/check <id або посилання> — оцінити конкретне авто\n' +
  '/top — найкращі знайдені пропозиції\n' +
  '/start — підписатися на вигідні пропозиції\n' +
  '/stop — відписатися\n' +
  '/mute — тимчасово вимкнути сповіщення\n' +
  '/profiles — які ніші зараз моніторимо\n' +
  '/help — ця довідка';

/** Telegram bot commands (FR-015) + on-demand queries. */
@Update()
export class TelegramBotUpdate {
  constructor(
    private readonly subscribers: SubscribersService,
    private readonly profiles: ProfilesService,
    private readonly query: QueryService,
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
      profiles.length > 0 ? profiles.map((p) => `• ${p.name}`).join('\n') : 'Активних ніш немає.';
    await ctx.reply(`Ніші, що моніторяться:\n${list}`);
  }

  @Command('check')
  async onCheck(@Ctx() ctx: Context): Promise<void> {
    const externalId = extractAutoId(commandArg(ctx));
    if (!externalId) {
      await ctx.reply('Вкажіть id або посилання, напр.: /check 38561317');
      return;
    }
    try {
      const a = await this.query.assessById(externalId);
      await ctx.reply(formatAssessment(a.detail, a.result, a.fairValue, a.currency));
    } catch {
      await ctx.reply('Не вдалося перевірити (ліміт запитів або оголошення недоступне). Спробуйте пізніше.');
    }
  }

  @Command('top')
  async onTop(@Ctx() ctx: Context): Promise<void> {
    const items = await this.query.topOpportunities(5);
    if (items.length === 0) {
      await ctx.reply('Поки немає знайдених вигідних пропозицій.');
      return;
    }
    const lines = items.map(({ opportunity, listing }) => {
      const name = listing
        ? `${listing.make} ${listing.model}, ${listing.year}`
        : 'оголошення';
      const link = listing ? `\n  ${listing.url}` : '';
      return `• ${name} — бал ${opportunity.score}, ${opportunity.askingValue} ${opportunity.currency}${link}`;
    });
    await ctx.reply(`Топ вигідних пропозицій:\n${lines.join('\n')}`);
  }

  @Help()
  async onHelp(@Ctx() ctx: Context): Promise<void> {
    await ctx.reply(HELP);
  }
}

/** Read the text after the command (e.g. "/check 12345" → "12345"). */
function commandArg(ctx: Context): string {
  const message = ctx.message;
  const text = message && 'text' in message ? message.text : '';
  return text.replace(/^\/\w+(@\w+)?\s*/, '').trim();
}

/** Extract an AUTO.RIA auto_id from a raw id or a listing URL. */
function extractAutoId(input: string): string | null {
  const match = input.match(/(\d{6,})/);
  return match ? match[1] : null;
}
