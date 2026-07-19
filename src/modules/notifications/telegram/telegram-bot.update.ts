import { Action, Command, Ctx, Help, Start, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';

import { CalibrationService } from '../../calibration/calibration.service';
import { ManualLabel } from '../../calibration/entities/outcome.entity';
import { OutcomesService } from '../../calibration/outcomes.service';
import { ProfilesService } from '../../profiles/profiles.service';
import { QueryService } from '../../query/query.service';
import { formatReport } from '../../query/report';
import { formatCalibration } from '../format/calibration-message';
import { formatAssessment } from '../format/opportunity-message';
import { formatWeights } from '../format/weights-message';
import { formatWhy } from '../format/why-message';
import { SubscribersService } from '../subscribers.service';

import { parseOutcomeCallback } from './outcome-callback';

/** Example listing URL shown in prompts (operators paste the auto.ria link, not a numeric id). */
const URL_EXAMPLE = 'https://auto.ria.com/uk/auto_hyundai_sonata_40143820.html';

const HELP =
  '/check <посилання> — оцінити конкретне авто\n' +
  '/why <посилання> — пояснити, чому такий бал\n' +
  '/top [N] — знайдені вигідні пропозиції (за замовчуванням 5)\n' +
  '/best [N] — найкращі оцінені авто (навіть нижче порогу, за замовчуванням 5)\n' +
  '/last [N] — останні оцінки (за замовчуванням 10)\n' +
  '/report — звіт по відбору + підказка порогу\n' +
  '/calibrate — підібрати пороги за даними\n' +
  '/params — поточні пороги\n' +
  '/revert — відкотити останнє калібрування\n' +
  '/weights — навчання ваг (пропозиція)\n' +
  '/weights_apply — застосувати запропоновані ваги\n' +
  '/outcome <посилання> <результат> — записати, що сталося з авто\n' +
  '/start — підписатися на вигідні пропозиції\n' +
  '/stop — відписатися\n' +
  '/mute — тимчасово вимкнути сповіщення\n' +
  '/profiles — які ніші зараз моніторимо\n' +
  '/blacklist "Назва ніші" — показати чорний список ніші\n' +
  '/blacklist_add "Назва ніші" "Марка Модель" — додати в чорний список\n' +
  '/blacklist_remove "Назва ніші" "Марка Модель" — видалити з чорного списку\n' +
  '/help — ця довідка';

/** Telegram bot commands (FR-015) + on-demand queries. */
@Update()
export class TelegramBotUpdate {
  constructor(
    private readonly subscribers: SubscribersService,
    private readonly profiles: ProfilesService,
    private readonly query: QueryService,
    private readonly outcomes: OutcomesService,
    private readonly calibration: CalibrationService,
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

  @Command('blacklist')
  async onBlacklistShow(@Ctx() ctx: Context): Promise<void> {
    const { name } = parseQuotedOrPlain(commandArg(ctx));
    if (!name) {
      await ctx.reply('Вкажіть назву ніші: /blacklist "Назва ніші"');
      return;
    }
    const profile = await this.profiles.findByName(name);
    if (!profile) {
      await ctx.reply(`Нішу "${name}" не знайдено. /profiles — список ніш.`);
      return;
    }
    const bl = profile.filters?.excludeMakeModels ?? [];
    await ctx.reply(
      bl.length
        ? `Чорний список для "${name}":\n${bl.map((x) => `• ${x}`).join('\n')}`
        : `Чорний список для "${name}" порожній.`,
    );
  }

  @Command('blacklist_add')
  async onBlacklistAdd(@Ctx() ctx: Context): Promise<void> {
    const { name, items } = parseQuotedOrPlain(commandArg(ctx));
    if (!name || items.length === 0) {
      await ctx.reply('Формат: /blacklist_add "Назва ніші" "Марка Модель" ["Марка Модель"...]');
      return;
    }
    const profile = await this.profiles.findByName(name);
    if (!profile) {
      await ctx.reply(`Нішу "${name}" не знайдено. /profiles — список ніш.`);
      return;
    }
    const updated = await this.profiles.addToBlacklist(profile.id, items);
    await ctx.reply(
      `Оновлено чорний список для "${name}":\n${updated.map((x) => `• ${x}`).join('\n')}`,
    );
  }

  @Command('blacklist_remove')
  async onBlacklistRemove(@Ctx() ctx: Context): Promise<void> {
    const { name, items } = parseQuotedOrPlain(commandArg(ctx));
    if (!name || items.length === 0) {
      await ctx.reply('Формат: /blacklist_remove "Назва ніші" "Марка Модель" ["Марка Модель"...]');
      return;
    }
    const profile = await this.profiles.findByName(name);
    if (!profile) {
      await ctx.reply(`Нішу "${name}" не знайдено. /profiles — список ніш.`);
      return;
    }
    const updated = await this.profiles.removeFromBlacklist(profile.id, items);
    await ctx.reply(
      `Оновлено чорний список для "${name}":\n${updated.length ? updated.map((x) => `• ${x}`).join('\n') : '(порожній)'}`,
    );
  }

  @Command('check')
  async onCheck(@Ctx() ctx: Context): Promise<void> {
    const externalId = extractAutoId(commandArg(ctx));
    if (!externalId) {
      await ctx.reply(`Надішліть посилання на оголошення, напр.:\n/check ${URL_EXAMPLE}`);
      return;
    }
    try {
      const a = await this.query.assessById(externalId);
      await ctx.reply(formatAssessment(a.detail, a.result, a.fairValue, a.currency));
    } catch {
      await ctx.reply(
        'Не вдалося перевірити (ліміт запитів або оголошення недоступне). Спробуйте пізніше.',
      );
    }
  }

  @Command('why')
  async onWhy(@Ctx() ctx: Context): Promise<void> {
    const externalId = extractAutoId(commandArg(ctx));
    if (!externalId) {
      await ctx.reply(`Надішліть посилання на оголошення, напр.:\n/why ${URL_EXAMPLE}`);
      return;
    }
    try {
      const a = await this.query.assessById(externalId);
      await ctx.reply(
        formatWhy(a.detail, a.result, {
          fairValue: a.fairValue,
          currency: a.currency,
          sampleSize: a.sampleSize,
          benchmarkBase: a.benchmarkBase,
          mileageAware: a.mileageAware,
        }),
      );
    } catch {
      await ctx.reply(
        'Не вдалося пояснити (ліміт запитів або оголошення недоступне). Спробуйте пізніше.',
      );
    }
  }

  @Command('top')
  async onTop(@Ctx() ctx: Context): Promise<void> {
    const limit = parseLimit(commandArg(ctx));
    const items = await this.query.topOpportunities(limit);
    if (items.length === 0) {
      await ctx.reply('Поки немає знайдених вигідних пропозицій.');
      return;
    }
    const lines = items.map(({ opportunity, listing }) => {
      const name = listing ? `${listing.make} ${listing.model}, ${listing.year}` : 'оголошення';
      const link = listing ? `\n  ${listing.url}` : '';
      return `• ${name} — бал ${opportunity.score}, ${opportunity.askingValue} ${opportunity.currency}${link}`;
    });
    await ctx.reply(`Топ вигідних пропозицій (${items.length}):\n${lines.join('\n')}`);
  }

  @Command('best')
  async onBest(@Ctx() ctx: Context): Promise<void> {
    const limit = parseLimit(commandArg(ctx));
    const listings = await this.query.topCandidates(limit);
    if (listings.length === 0) {
      await ctx.reply('Ще нічого не оцінено. Дай боту попрацювати або надішли /check <посилання>.');
      return;
    }
    const lines = listings.map((l) => {
      const score = l.lastScore ?? 0;
      return `• ${l.make} ${l.model}, ${l.year} — бал ${score}, ${l.currentAmount} ${l.currentCurrency}\n  ${l.url}`;
    });
    await ctx.reply(`Найкращі оцінені (${listings.length}):\n${lines.join('\n')}`);
  }

  @Command('last')
  async onHistory(@Ctx() ctx: Context): Promise<void> {
    const limit = parseLimit(commandArg(ctx));
    const evaluations = await this.query.getRecentEvaluations(limit);
    if (evaluations.length === 0) {
      await ctx.reply('Оцінок поки немає.');
      return;
    }
    const lines = evaluations.map((l) => {
      const score = l.lastScore ?? 0;
      const discount = l.lastDiscountPct ?? 0;
      const time = l.lastEvaluatedAt ? new Date(l.lastEvaluatedAt).toLocaleString('uk-UA') : '—';
      return `• ${l.make} ${l.model}, ${l.year} — бал ${score}, знижка ${discount.toFixed(1)}% (${time})\n  ${l.url}`;
    });
    await ctx.reply(`Останні оцінки (${evaluations.length}):\n${lines.join('\n')}`);
  }

  @Command('report')
  async onReport(@Ctx() ctx: Context): Promise<void> {
    const digest = await this.query.report();
    await ctx.reply(formatReport(digest));
  }

  @Command('calibrate')
  async onCalibrate(@Ctx() ctx: Context): Promise<void> {
    const mode = this.calibration.configuredMode();
    const lines = await this.calibration.runAndSummarize(mode);
    await ctx.reply(formatCalibration(lines, mode));
  }

  @Command('params')
  async onParams(@Ctx() ctx: Context): Promise<void> {
    const profiles = await this.profiles.getEnabled();
    if (profiles.length === 0) {
      await ctx.reply('Активних ніш немає.');
      return;
    }
    const lines = profiles.map((p) => `• ${p.name}: поріг ${p.minDealScore}`);
    await ctx.reply(`Поточні пороги:\n${lines.join('\n')}`);
  }

  @Command('revert')
  async onRevert(@Ctx() ctx: Context): Promise<void> {
    const profiles = await this.profiles.getEnabled();
    const reverted: string[] = [];
    for (const p of profiles) {
      const before = await this.calibration.revert(p.id);
      if (before != null) reverted.push(`• ${p.name}: повернено до ${before}`);
    }
    await ctx.reply(reverted.length ? `Відкат:\n${reverted.join('\n')}` : 'Нема що відкочувати.');
  }

  @Command('weights')
  async onWeights(@Ctx() ctx: Context): Promise<void> {
    const { proposal, candidateVersion } = await this.calibration.proposeWeights();
    await ctx.reply(formatWeights(proposal, candidateVersion));
  }

  @Command('weights_apply')
  async onWeightsApply(@Ctx() ctx: Context): Promise<void> {
    const version = await this.calibration.applyLatestWeightCandidate();
    await ctx.reply(
      version != null ? `Активовано набір ваг v${version}.` : 'Немає кандидата для застосування.',
    );
  }

  @Action(/^oc:/)
  async onOutcomeButton(@Ctx() ctx: Context): Promise<void> {
    const cq = ctx.callbackQuery;
    const data = cq && 'data' in cq ? cq.data : '';
    const parsed = parseOutcomeCallback(data);
    if (!parsed) {
      await ctx.answerCbQuery();
      return;
    }
    const op = await this.query.findOpportunity(parsed.opportunityId);
    if (!op) {
      await ctx.answerCbQuery('Не знайдено');
      return;
    }
    await this.outcomes.recordManual({
      listingId: op.listingId,
      opportunityId: op.id,
      label: parsed.label,
    });
    await ctx.answerCbQuery(
      parsed.label === 'good' ? 'Дякую — позначено вдалою' : 'Дякую — позначено невдалою',
    );
  }

  @Command('outcome')
  async onOutcome(@Ctx() ctx: Context): Promise<void> {
    const parts = commandArg(ctx).split(/\s+/).filter(Boolean);
    const externalId = extractAutoId(parts[0] ?? '');
    const label = parts[1] as ManualLabel;
    const note = parts.slice(2).join(' ') || null;
    const allowed: ManualLabel[] = ['good', 'bad', 'bought', 'skipped', 'resold'];
    if (!externalId || !allowed.includes(label)) {
      await ctx.reply(
        `Формат: /outcome <посилання> <good|bad|bought|skipped|resold> [нотатка]\nНапр.: /outcome ${URL_EXAMPLE} bought`,
      );
      return;
    }
    const listing = await this.query.findListingByExternalId(externalId);
    if (!listing) {
      await ctx.reply(
        'Оголошення ще не в базі — оцініть його спершу через /check або дочекайтесь поллінгу.',
      );
      return;
    }
    await this.outcomes.recordManual({ listingId: listing.id, label, note });
    await ctx.reply('Записав результат. Дякую!');
  }

  @Help()
  async onHelp(@Ctx() ctx: Context): Promise<void> {
    await ctx.reply(HELP);
  }
}

/** Read the text after the command (e.g. "/check <url>" -> "<url>"). */
function commandArg(ctx: Context): string {
  const message = ctx.message;
  const text = message && 'text' in message ? message.text : '';
  return text.replace(/^\/\w+(@\w+)?\s*/, '').trim();
}

/**
 * Extract an AUTO.RIA auto_id from a listing URL (or a raw id). The id is the last 6+ digit run —
 * auto.ria URLs put it at the end, e.g. `.../auto_hyundai_sonata_40143820.html` -> `40143820`.
 */
function extractAutoId(input: string): string | null {
  const matches = input.match(/\d{6,}/g);
  return matches ? matches[matches.length - 1] : null;
}

/** Parse an optional numeric limit from a command argument, clamped to [1, 100]. */
function parseLimit(arg: string): number {
  const n = parseInt(arg, 10);
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.min(n, 100);
}

/** Split argument into first token (quoted or plain) and the rest. */
function splitFirstQuotedOrPlain(arg: string): [string, string] {
  const trimmed = arg.trim();
  if (!trimmed) return ['', ''];
  if (trimmed[0] === '"') {
    const end = trimmed.indexOf('"', 1);
    if (end === -1) return [trimmed.slice(1), ''];
    const first = trimmed.slice(1, end);
    const rest = trimmed.slice(end + 1).trim();
    return [first, rest];
  }
  const space = trimmed.indexOf(' ');
  if (space === -1) return [trimmed, ''];
  return [trimmed.slice(0, space), trimmed.slice(space + 1)];
}

/** Parse profile name (quoted or plain) + items (quoted or plain, space-separated). */
function parseQuotedOrPlain(arg: string): { name: string; items: string[] } {
  const [name, rest] = splitFirstQuotedOrPlain(arg);
  if (!name) return { name: '', items: [] };
  const items: string[] = [];
  let remaining = rest;
  while (remaining.trim()) {
    const [item, rest2] = splitFirstQuotedOrPlain(remaining);
    if (!item) break;
    items.push(item);
    remaining = rest2;
  }
  return { name, items };
}
