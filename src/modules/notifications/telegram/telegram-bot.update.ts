import { Action, Command, Ctx, On, Start, Update } from 'nestjs-telegraf';
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
import { MAIN_MENU_KEYBOARD } from './ui/keyboards';

/** Example listing URL shown in prompts (operators paste the auto.ria link, not a numeric id). */
const URL_EXAMPLE = 'https://auto.ria.com/uk/auto_hyundai_sonata_40143820.html';

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
    await ctx.replyWithHTML(
      '👋 Welcome to RIA Analyzer!\n\n' +
      'I\'ll help you find the best car deals on AUTO.RIA.\n\n' +
      'Use the menu below or type commands:',
      { reply_markup: MAIN_MENU_KEYBOARD }
    );
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
    const { name } = this.parseQuotedOrPlain(this.commandArg(ctx));
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
    const { name, items } = this.parseQuotedOrPlain(this.commandArg(ctx));
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
    const { name, items } = this.parseQuotedOrPlain(this.commandArg(ctx));
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
    const externalId = this.extractAutoId(this.commandArg(ctx));
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
    const externalId = this.extractAutoId(this.commandArg(ctx));
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
    const limit = this.parseLimit(this.commandArg(ctx));
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
    const limit = this.parseLimit(this.commandArg(ctx));
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
  async onLast(@Ctx() ctx: Context): Promise<void> {
    const limit = this.parseLimit(this.commandArg(ctx));
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
    await this.outcomes.recordManual({ listingId: op.listingId, opportunityId: op.id, label: parsed.label });
    await ctx.answerCbQuery(parsed.label === 'good' ? 'Дякую — позначено вдалою' : 'Дякую — позначено невдалою');
  }

  @Command('outcome')
  async onOutcome(@Ctx() ctx: Context): Promise<void> {
    const parts = this.commandArg(ctx).split(/\s+/).filter(Boolean);
    const externalId = this.extractAutoId(parts[0] ?? '');
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
      await ctx.reply('Оголошення ще не в базі — оцініть його спершу через /check або дочекайтесь поллінгу.');
      return;
    }
    await this.outcomes.recordManual({ listingId: listing.id, label, note });
    await ctx.reply('Записав результат. Дякую!');
  }

  // ============ NEW UI: Inline handlers ============

  @Action(/^top:(\d+)$/)
  async onTopPage(@Ctx() ctx: Context): Promise<void> {
    const page = parseInt((ctx as any).match![1], 10);
    if (page < 1) return;
    await this.showTopDeals(ctx, 5, true, page);
  }

  @Action(/^best:(\d+)$/)
  async onBestPage(@Ctx() ctx: Context): Promise<void> {
    const page = parseInt((ctx as any).match![1], 10);
    if (page < 1) return;
    await this.showBestCandidates(ctx, 5, true, page);
  }

  @Action('top')
  async onTopAction(@Ctx() ctx: Context): Promise<void> {
    await this.showTopDeals(ctx, 5, true);
  }

  @Action('best')
  async onBestAction(@Ctx() ctx: Context): Promise<void> {
    await this.showBestCandidates(ctx, 5, true);
  }

  @Action('dashboard')
  async onDashboardAction(@Ctx() ctx: Context): Promise<void> {
    await this.showDashboard(ctx, true);
  }

  @Action('settings')
  async onSettingsAction(@Ctx() ctx: Context): Promise<void> {
    await this.showSettings(ctx, true);
  }

  @Action('notifications')
  async onNotificationsAction(@Ctx() ctx: Context): Promise<void> {
    const chatId = String(ctx.chat!.id);
    const sub = await this.subscribers.findByChatId(chatId);
    const enabled = sub?.state === 'active';
    const muted = sub?.state === 'muted';

    const { formatNotifications } = await import('./ui/formatters');
    const { InlineKeyboard } = await import('./ui/keyboards');

    const text = formatNotifications(enabled, muted);
    const kb = new InlineKeyboard()
      .button(enabled ? '🔴 Disable' : '🟢 Enable', 'notifications_toggle')
      .button(muted ? '🔊 Unmute' : '🔇 Mute', 'notifications_mute')
      .row({ text: '⬅️ Back', callback_data: 'settings' });

    await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb.build() });
  }

  @Action('notifications_toggle')
  async onNotificationsToggle(@Ctx() ctx: Context): Promise<void> {
    const chatId = String(ctx.chat!.id);
    const sub = await this.subscribers.findByChatId(chatId);
    if (sub) {
      if (sub.state === 'muted') {
        await this.subscribers.activate(chatId);
      } else {
        await this.subscribers.mute(chatId);
      }
    }
    await this.onNotificationsAction(ctx);
  }

  @Action('main')
  async onMainMenu(@Ctx() ctx: Context): Promise<void> {
    await ctx.editMessageText('📱 <b>Main Menu</b>', {
      parse_mode: 'HTML',
      ...MAIN_MENU_KEYBOARD,
    });
  }

  @Action(/^check:(.+)$/)
  async onCheckInline(@Ctx() ctx: Context): Promise<void> {
    const externalId = (ctx as any).match![1];
    await ctx.answerCbQuery();
    await ctx.editMessageText('🔍 Analyzing vehicle...', { parse_mode: 'HTML' });
    await this.checkCar(ctx, externalId);
  }

  @Action(/^why:(.+)$/)
  async onWhyInline(@Ctx() ctx: Context): Promise<void> {
    const externalId = (ctx as any).match![1];
    await ctx.answerCbQuery();
    await ctx.editMessageText('📝 Loading explanation...', { parse_mode: 'HTML' });
    await this.showWhy(ctx, externalId);
  }

  @Action('history')
  async onHistoryAction(@Ctx() ctx: Context): Promise<void> {
    await this.showHistory(ctx, 10, true);
  }

  @Action('profiles')
  async onProfilesAction(@Ctx() ctx: Context): Promise<void> {
    await this.showProfiles(ctx, true);
  }

  @Action('blacklist')
  async onBlacklistAction(@Ctx() ctx: Context): Promise<void> {
    await this.showBlacklistMenu(ctx, true);
  }

  @Action('calibrate')
  async onCalibrateAction(@Ctx() ctx: Context): Promise<void> {
    await this.showCalibration(ctx, true);
  }

  @Action('notifications_mute')
  async onNotificationsMute(@Ctx() ctx: Context): Promise<void> {
    const chatId = String(ctx.chat!.id);
    const sub = await this.subscribers.findByChatId(chatId);
    if (sub) {
      if (sub.state === 'muted') {
        await this.subscribers.activate(chatId);
      } else {
        await this.subscribers.mute(chatId);
      }
    }
    await this.onNotificationsAction(ctx);
  }

  @Action('calibrate_run')
  async onCalibrateRun(@Ctx() ctx: Context): Promise<void> {
    await ctx.answerCbQuery('Running calibration...');
    const mode = this.calibration.configuredMode();
    const lines = await this.calibration.runAndSummarize(mode);
    const { formatCalibration } = await import('../format/calibration-message');
    await ctx.editMessageText(formatCalibration(lines, mode), { parse_mode: 'HTML' });
  }

  // ============ New UI helper methods ============

  private async showVehicleActionMenu(ctx: Context, externalId: string): Promise<void> {
    const { InlineKeyboard } = await import('./ui/keyboards');
    const kb = new InlineKeyboard()
      .button('🔍 Evaluate', `check:${externalId}`)
      .button('📝 Why', `why:${externalId}`)
      .button('💾 Save outcome', `outcome:${externalId}`)
      .row({ text: '🌐 Open listing', url: `https://auto.ria.com/uk/auto_${externalId}.html` });

    await ctx.reply(
      '🚗 <b>AUTO.RIA listing detected.</b>\n\nWhat would you like to do?',
      { parse_mode: 'HTML', ...kb.build() }
    );
  }

  private async checkCar(ctx: Context, externalId: string): Promise<void> {
    try {
      const a = await this.query.assessById(externalId);
      const { formatVehicleCardWithFactors } = await import('./ui/formatters');
      const text = formatVehicleCardWithFactors(a.detail, a.result);
      const { InlineKeyboard } = await import('./ui/keyboards');
      const kb = new InlineKeyboard()
        .button('📝 Why', `why:${externalId}`)
        .button('💾 Save outcome', `outcome:${externalId}`)
        .row({ text: '🌐 Open listing', url: `https://auto.ria.com/uk/auto_${externalId}.html` });
      await ctx.reply(text, { parse_mode: 'HTML', ...kb.build() });
    } catch {
      await ctx.reply('❌ Failed to analyze. Check link or try later.');
    }
  }

  private async showWhy(ctx: Context, externalId: string): Promise<void> {
    try {
      const a = await this.query.assessById(externalId);
      const { formatWhyMessage } = await import('./ui/formatters');
      const text = formatWhyMessage(
        a.detail, a.result,
        a.fairValue, a.currency,
        a.sampleSize, String(a.benchmarkBase), a.mileageAware
      );
      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch {
      await ctx.reply('❌ Failed to explain.');
    }
  }

  private async showTopDeals(ctx: Context, limit = 5, edit = false, page = 1): Promise<void> {
    const { formatTopDeals } = await import('./ui/formatters');
    const { paginationKeyboard } = await import('./ui/keyboards');
    const items = await this.query.topOpportunities(limit * page);
    const paginated = items.slice((page - 1) * limit, page * limit);
    const totalPages = Math.ceil(items.length / limit) || 1;

    const text = formatTopDeals(paginated, page, totalPages, limit);
    const kb = paginationKeyboard(page, totalPages, 'top');

    if (edit) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', ...kb });
    }
  }

  private async showBestCandidates(ctx: Context, limit = 5, edit = false, page = 1): Promise<void> {
    const { formatBestCandidates } = await import('./ui/formatters');
    const { paginationKeyboard } = await import('./ui/keyboards');
    const items = await this.query.topCandidates(limit * page);
    const paginated = items.slice((page - 1) * limit, page * limit);
    const totalPages = Math.ceil(items.length / limit) || 1;

    const text = formatBestCandidates(paginated, page, totalPages, limit);
    const kb = paginationKeyboard(page, totalPages, 'best');

    if (edit) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', ...kb });
    }
  }

  private async showDashboard(ctx: Context, edit = false): Promise<void> {
    const { formatDashboard } = await import('./ui/formatters');
    const profiles = await this.profiles.getEnabled();
    const text = formatDashboard({
      evaluated: 0,
      topDeals: (await this.query.topOpportunities(1)).length,
      profiles: profiles.length,
      lastCalibration: null,
      avgScore: 0,
    });
    const { InlineKeyboard } = await import('./ui/keyboards');
    const kb = new InlineKeyboard()
      .button('🔥 Top Deals', 'top')
      .button('📊 Best Candidates', 'best')
      .row({ text: '📋 Profiles', callback_data: 'profiles' })
      .row({ text: '📈 History', callback_data: 'history' })
      .row({ text: '⚙️ Settings', callback_data: 'settings' })
      .row({ text: '⚖️ Calibrate', callback_data: 'calibrate' });

    if (edit) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb.build() });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', ...kb.build() });
    }
  }

  private async showSettings(ctx: Context, edit = false): Promise<void> {
    const { formatSettings } = await import('./ui/formatters');
    const profiles = await this.profiles.getEnabled();
    const text = formatSettings(true, profiles.length, 0);
    const { InlineKeyboard } = await import('./ui/keyboards');
    const kb = new InlineKeyboard()
      .button('🔔 Notifications', 'notifications')
      .button('📋 Profiles', 'profiles')
      .row({ text: '🚫 Blacklist', callback_data: 'blacklist' })
      .row({ text: '⬅️ Back', callback_data: 'main' });

    if (edit) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb.build() });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', ...kb.build() });
    }
  }

  @On('text')
  async onText(@Ctx() ctx: Context): Promise<void> {
    const message = ctx.message;
    if (!message || !('text' in message)) return;

    const text = message.text.trim();

    // Auto-detect AUTO.RIA URL
    const externalId = this.extractAutoId(text);
    if (externalId && text.includes('auto.ria.com')) {
      await this.showVehicleActionMenu(ctx, externalId);
      return;
    }

    // Handle menu button presses
    switch (text) {
      case '🚗 Check car':
        await ctx.reply('🔍 Send me an AUTO.RIA link to analyze:');
        break;
      case '🔥 Top deals':
        await this.showTopDeals(ctx, 5);
        break;
      case '📊 Dashboard':
        await this.showDashboard(ctx);
        break;
      case '⚙️ Settings':
        await this.showSettings(ctx);
        break;
      default:
        // Ignore other text
        break;
    }
  }

  private async showHistory(ctx: Context, limit = 10, edit = false, page = 1): Promise<void> {
    const { paginationKeyboard } = await import('./ui/keyboards');
    const items = await this.query.getRecentEvaluations(limit * page);
    const paginated = items.slice((page - 1) * limit, page * limit);
    const totalPages = Math.ceil(items.length / limit) || 1;

    const text = `📈 <b>Recent Evaluations</b> (page ${page}/${totalPages})\n\n` +
      (paginated.length === 0 ? 'No evaluations yet.' :
        paginated.map((e, i) => {
          const score = e.lastScore ?? 0;
          const discount = e.lastDiscountPct ?? 0;
          const time = e.lastEvaluatedAt ? new Date(e.lastEvaluatedAt).toLocaleString('uk-UA') : '—';
          return `${i + 1}. <b>${e.make} ${e.model}, ${e.year}</b> — Score: ${score}, Discount: ${discount.toFixed(1)}% (${time})\n  🔗 ${e.url}`;
        }).join('\n\n')
      );

    const kb = paginationKeyboard(page, totalPages, 'history');

    if (edit) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', ...kb });
    }
  }

  private async showProfiles(ctx: Context, edit = false): Promise<void> {
    const profiles = await this.profiles.getEnabled();
    const { formatProfiles } = await import('./ui/formatters');
    const text = formatProfiles(profiles);
    const { InlineKeyboard } = await import('./ui/keyboards');
    const kb = new InlineKeyboard()
      .button('🔄 Refresh', 'profiles')
      .button('🚫 Blacklist', 'blacklist')
      .row({ text: '⬅️ Back', callback_data: 'main' });

    if (edit) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb.build() });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', ...kb.build() });
    }
  }

  private async showBlacklistMenu(ctx: Context, edit = false): Promise<void> {
    const profiles = await this.profiles.getEnabled();
    const { itemListKeyboard } = await import('./ui/keyboards');
    const kb = itemListKeyboard(
      profiles,
      p => p.name,
      p => `blacklist_show:${p.id}`,
      'main'
    );
    const text = '📋 Select profile to manage blacklist:';

    if (edit) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', ...kb });
    }
  }

  private async showCalibration(ctx: Context, edit = false): Promise<void> {
    const mode = this.calibration.configuredMode();
    const { formatCalibration } = await import('../format/calibration-message');
    const { InlineKeyboard } = await import('./ui/keyboards');
    const lines = await this.calibration.runAndSummarize(mode);
    const text = formatCalibration(lines, mode);
    const kb = new InlineKeyboard()
      .button('▶️ Run Calibration', 'calibrate_run')
      .row({ text: '⬅️ Back', callback_data: 'main' });

    if (edit) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', ...kb.build() });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', ...kb.build() });
    }
  }

  /** Extract an AUTO.RIA auto_id from a listing URL (or a raw id). */
  private extractAutoId(input: string): string | null {
    const matches = input.match(/\d{6,}/g);
    return matches ? matches[matches.length - 1] : null;
  }

  /** Read the text after the command (e.g. "/check <url>" -> "<url>"). */
  private commandArg(ctx: Context): string {
    const message = ctx.message;
    const text = message && 'text' in message ? message.text : '';
    return text.replace(/^\/\w+(@\w+)?\s*/, '').trim();
  }

  /** Parse an optional numeric limit from a command argument, clamped to [1, 100]. */
  private parseLimit(arg: string, defaultLimit = 5): number {
    const n = parseInt(arg, 10);
    if (!Number.isFinite(n) || n <= 0) return defaultLimit;
    return Math.min(n, 100);
  }

  /** Split argument into first token (quoted or plain) and the rest. */
  private splitFirstQuotedOrPlain(arg: string): [string, string] {
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
  private parseQuotedOrPlain(arg: string): { name: string; items: string[] } {
    const [name, rest] = this.splitFirstQuotedOrPlain(arg);
    if (!name) return { name: '', items: [] };
    const items: string[] = [];
    let remaining = rest;
    while (remaining.trim()) {
      const [item, rest2] = this.splitFirstQuotedOrPlain(remaining);
      if (!item) break;
      items.push(item);
      remaining = rest2;
    }
return { name, items };
  }
}