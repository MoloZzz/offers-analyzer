import { Context } from 'telegraf';
import { Repository } from 'typeorm';

import { Currency } from '../../src/common/types/money';
import { Listing } from '../../src/modules/listings/entities/listing.entity';
import { ListingsService } from '../../src/modules/listings/listings.service';
import { Notification } from '../../src/modules/notifications/entities/notification.entity';
import { formatOpportunity } from '../../src/modules/notifications/format/opportunity-message';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { SubscribersService } from '../../src/modules/notifications/subscribers.service';
import { parseDetailsCallback } from '../../src/modules/notifications/telegram/details-callback';
import { TelegramBotUpdate } from '../../src/modules/notifications/telegram/telegram-bot.update';
import { QueryService } from '../../src/modules/query/query.service';
import { RateBudgetService } from '../../src/modules/scheduling/rate-budget.service';
import { ListingSource } from '../../src/modules/sources/ports/listing-source.port';
import { EvaluationExplanationV3 } from '../../src/modules/valuation/evaluation-explanation';

const LISTING_ID = '6f2b1f7a-6a1e-4f4e-9c53-3b3f0a2f9a11';

const explanation: EvaluationExplanationV3 = {
  schemaVersion: 3,
  evaluatedAt: '2026-08-01T09:00:00.000Z',
  parameterSetVersion: 4,
  thresholdUsed: 0.63,
  listing: {
    externalId: '38561317',
    make: 'BMW',
    model: '3 Series',
    year: 2017,
    url: 'https://auto.ria.com/auto_38561317.html',
    askingAmount: 12000,
    currency: Currency.USD,
  },
  cohort: { key: 'BMW:3:2016-2018', tier: 'year±1', sampleSize: 12, mileageAware: false },
  fairValueBase: 15500,
  fairValueAdjusted: 16000,
  mileageAdjustment: 500,
  discountPct: 25,
  raw: 0.83,
  confidence: 0.9,
  penalty: 0.9,
  score: 0.75,
  priceCore: 0.75,
  total100: 88,
  factors: [],
  firedFlags: [{ code: 'no_vin_report', source: 'auto-ria' }],
  redFlags: { no_vin_report: true },
  reason: 'deal score 0.75 ≥ threshold 0.3',
  isOpportunity: true,
  disqualified: false,
  assessmentConfidence: null,
};

const listing = {
  id: LISTING_ID,
  make: 'BMW',
  model: '3 Series',
  year: 2017,
  mileage: 127,
  stateId: 12,
  cityId: 34,
  sellerType: 'private',
  url: 'https://auto.ria.com/auto_38561317.html',
  lastExplanation: explanation,
} as unknown as Listing;

const opportunity = {
  id: 'opp-1',
  listingId: LISTING_ID,
  profileId: 'profile-1',
  askingValue: 12000,
  fairValue: 16000,
  discountPct: 25,
  confidence: 0.9,
  score: 0.75,
  sampleSize: 42,
  currency: 'USD',
  redFlags: { no_vin_report: true },
  explanation,
} as unknown as never;

/**
 * A real `QueryService` with only the collaborators the stored read touches. The source and the
 * budget are live jest mocks precisely so the test can assert they were **never** reached — that is
 * SC-002, and a hand-rolled stub of `storedBreakdownById` would prove nothing.
 */
function buildQuery(found: Listing | null): {
  query: QueryService;
  source: { getListing: jest.Mock; searchListings: jest.Mock };
  budget: { tryConsume: jest.Mock; record: jest.Mock };
} {
  const source = { getListing: jest.fn(), searchListings: jest.fn() };
  const budget = { tryConsume: jest.fn(), record: jest.fn() };
  const query = Object.create(QueryService.prototype) as QueryService;
  Object.assign(query, {
    source: source as unknown as ListingSource,
    budget: budget as unknown as RateBudgetService,
    listings: {
      findByIds: jest.fn().mockResolvedValue(found ? [found] : []),
    } as unknown as ListingsService,
    valuationEvidence: undefined,
  });
  return { query, source, budget };
}

function buildBot(query: QueryService): { update: TelegramBotUpdate; ctx: Context & { reply: jest.Mock; answerCbQuery: jest.Mock } } {
  const update = new TelegramBotUpdate(
    {} as never,
    {} as never,
    query,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { get: () => [] } as never,
    {} as never,
  );
  const ctx = {
    chat: { id: 77 },
    callbackQuery: { data: `details:${LISTING_ID}` },
    reply: jest.fn().mockResolvedValue(undefined),
    answerCbQuery: jest.fn().mockResolvedValue(undefined),
  } as unknown as Context & { reply: jest.Mock; answerCbQuery: jest.Mock };
  return { update, ctx };
}

async function deliverAlert(): Promise<{ text: string; buttons: Array<Array<{ text: string; data: string }>> }> {
  const notifier = { send: jest.fn().mockResolvedValue(undefined) };
  const service = new NotificationsService(
    { listActive: jest.fn().mockResolvedValue([{ id: 'sub', telegramChatId: '100', profileIds: null }]) } as unknown as SubscribersService,
    {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((x) => x),
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as Repository<Notification>,
    notifier as never,
  );

  await service.notifyOpportunity(opportunity, listing);
  return notifier.send.mock.calls[0][0];
}

describe('Деталі button — alert → tap → breakdown (spec 016 US16.2)', () => {
  it('keeps the pushed alert body at its pre-016 line count and adds only a button row (SC-001)', async () => {
    const sent = await deliverAlert();

    expect(sent.text).toBe(formatOpportunity(opportunity, listing));
    // Seven lines, exactly as `alert-format.spec.ts` has asserted since before spec 016: the
    // breakdown is reachable from the alert without occupying a single extra line of it.
    expect(sent.text.split('\n')).toHaveLength(7);
    expect(sent.buttons.at(-1)).toEqual([
      { text: '📋 Деталі', data: `details:${LISTING_ID}` },
    ]);
  });

  it('replies with the full breakdown and records zero source requests or budget charges (SC-002)', async () => {
    const sent = await deliverAlert();
    const listingId = parseDetailsCallback(sent.buttons.at(-1)![0].data);
    const { query, source, budget } = buildQuery(listing);
    const { update, ctx } = buildBot(query);

    await update.onDetailsButton(ctx);

    const reply = ctx.reply.mock.calls.map((c) => c[0]).join('\n');
    expect(listingId).toBe(LISTING_ID);
    expect(reply).toContain('Параметри: ParameterSet v4, поріг 0.63');
    expect(reply).toContain('Розклад балу: знижка → raw 0.83 × впевненість 0.9 × штраф 0.9 = 0.75');
    expect(reply).toContain('⚠️ Ризики: дані AUTO.RIA: немає VIN-звіту');
    expect(reply).toContain('🧭 Впевненість оцінки');

    expect(source.getListing).not.toHaveBeenCalled();
    expect(source.searchListings).not.toHaveBeenCalled();
    expect(budget.tryConsume).not.toHaveBeenCalled();
    expect(budget.record).not.toHaveBeenCalled();
  });

  it('produces an identical reply on repeat taps and charges nothing (AS-4)', async () => {
    const { query, source } = buildQuery(listing);
    const { update, ctx } = buildBot(query);

    await update.onDetailsButton(ctx);
    const first = ctx.reply.mock.calls.map((c) => c[0]);
    ctx.reply.mockClear();
    await update.onDetailsButton(ctx);

    expect(ctx.reply.mock.calls.map((c) => c[0])).toEqual(first);
    expect(source.getListing).not.toHaveBeenCalled();
  });

  it('says the evaluation predates persistence and offers /check, rather than re-fetching (AS-3)', async () => {
    const { query, source } = buildQuery({ ...listing, lastExplanation: null } as Listing);
    const { update, ctx } = buildBot(query);

    await update.onDetailsButton(ctx);

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(ctx.reply.mock.calls[0][0]).toContain('до того, як бот почав зберігати');
    expect(ctx.reply.mock.calls[0][0]).toContain('/check');
    expect(source.getListing).not.toHaveBeenCalled();
  });

  it('answers a deleted listing plainly, with no error surface', async () => {
    const { query } = buildQuery(null);
    const { update, ctx } = buildBot(query);

    await update.onDetailsButton(ctx);

    expect(ctx.answerCbQuery).toHaveBeenCalled();
    expect(ctx.reply.mock.calls[0][0]).toBe('Оголошення більше недоступне.');
  });
});
