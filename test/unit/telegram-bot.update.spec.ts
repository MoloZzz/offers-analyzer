import { Context } from 'telegraf';

import { CalibrationService } from '../../src/modules/calibration/calibration.service';
import { DealsService } from '../../src/modules/calibration/deals.service';
import { OutcomesService } from '../../src/modules/calibration/outcomes.service';
import { SubscribersService } from '../../src/modules/notifications/subscribers.service';
import { TelegramBotUpdate } from '../../src/modules/notifications/telegram/telegram-bot.update';
import { ProfilesService } from '../../src/modules/profiles/profiles.service';
import { QueryService } from '../../src/modules/query/query.service';

type TestContext = Context & { reply: jest.Mock };

function buildContext(text: string): TestContext {
  return {
    chat: { id: 77 },
    message: { text },
    reply: jest.fn().mockResolvedValue(undefined),
  } as unknown as TestContext;
}

interface SubscriberMocks {
  subscribeAll: jest.Mock;
  subscribeToProfile: jest.Mock;
  unsubscribe: jest.Mock;
  mute: jest.Mock;
}

interface ProfileMocks {
  getEnabled: jest.Mock;
  findByName: jest.Mock;
  addToBlacklist: jest.Mock;
  removeFromBlacklist: jest.Mock;
}

function buildUpdate(): {
  update: TelegramBotUpdate;
  subscribers: SubscriberMocks;
  profiles: ProfileMocks;
  query: QueryService & { assessById: jest.Mock; whyById: jest.Mock };
} {
  const subscriberMocks: SubscriberMocks = {
    subscribeAll: jest.fn().mockResolvedValue(undefined),
    subscribeToProfile: jest.fn().mockResolvedValue(undefined),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    mute: jest.fn().mockResolvedValue(undefined),
  };

  const profileMocks: ProfileMocks = {
    getEnabled: jest.fn().mockResolvedValue([]),
    findByName: jest.fn(),
    addToBlacklist: jest.fn(),
    removeFromBlacklist: jest.fn(),
  };

  const query = {
    assessById: jest.fn(),
    whyById: jest.fn(),
    topOpportunities: jest.fn(),
    topCandidates: jest.fn(),
    getRecentEvaluations: jest.fn(),
    report: jest.fn(),
    budgetReport: jest.fn(),
    dealsOverview: jest.fn(),
    findOpportunity: jest.fn(),
    findListingByExternalId: jest.fn(),
    findListingById: jest.fn(),
  } as unknown as QueryService;

  const outcomes = {
    recordManual: jest.fn(),
    recordPassive: jest.fn(),
  } as unknown as OutcomesService;

  const calibration = {
    configuredMode: jest.fn(),
    runAndSummarize: jest.fn(),
    revert: jest.fn(),
    proposeWeights: jest.fn(),
    applyLatestWeightCandidate: jest.fn(),
  } as unknown as CalibrationService;

  const deals = {
    markDeclined: jest.fn(),
    markBought: jest.fn(),
    upsertForListing: jest.fn(),
    closedDeals: jest.fn(),
    openDeals: jest.fn(),
    dueForReminder: jest.fn(),
  } as unknown as DealsService;

  const subscribers = subscriberMocks as unknown as SubscribersService;
  const profiles = profileMocks as unknown as ProfilesService;

  return {
    update: new TelegramBotUpdate(subscribers, profiles, query, outcomes, calibration, deals),
    subscribers: subscriberMocks,
    profiles: profileMocks,
    query: query as QueryService & { assessById: jest.Mock; whyById: jest.Mock },
  };
}

describe('TelegramBotUpdate', () => {
  it('keeps /start as a full subscription reset and /stop as unsubscribe', async () => {
    const { update, subscribers } = buildUpdate();
    const ctx = buildContext('/start');

    await update.onStart(ctx);
    await update.onStop(buildContext('/stop'));

    expect(subscribers.subscribeAll).toHaveBeenCalledWith('77');
    expect(subscribers.unsubscribe).toHaveBeenCalledWith('77');
    expect(ctx.reply).toHaveBeenCalled();
  });

  it('supports /subscribe with all-niche and named-profile modes', async () => {
    const { update, subscribers, profiles } = buildUpdate();
    profiles.findByName.mockResolvedValue({ id: 'profile-9', name: 'Kyiv' });

    const allCtx = buildContext('/subscribe');
    await update.onSubscribe(allCtx);
    expect(subscribers.subscribeAll).toHaveBeenCalledWith('77');
    expect(allCtx.reply).toHaveBeenCalled();

    const namedCtx = buildContext('/subscribe "Kyiv"');
    await update.onSubscribe(namedCtx);
    expect(profiles.findByName).toHaveBeenCalledWith('Kyiv');
    expect(subscribers.subscribeToProfile).toHaveBeenCalledWith('77', 'profile-9');
    expect(namedCtx.reply).toHaveBeenCalled();
  });

  it('supports /unsubscribe as an alias', async () => {
    const { update, subscribers } = buildUpdate();
    const ctx = buildContext('/unsubscribe');

    await update.onUnsubscribe(ctx);

    expect(subscribers.unsubscribe).toHaveBeenCalledWith('77');
    expect(ctx.reply).toHaveBeenCalled();
  });

  it('uses a stored /why explanation without live reassessment', async () => {
    const { update, query } = buildUpdate();
    query.whyById.mockResolvedValue({
      stored: {
        schemaVersion: 1,
        evaluatedAt: '2026-07-28T10:00:00.000Z',
        parameterSetVersion: 3,
        thresholdUsed: 0.4,
        listing: {
          externalId: '40143820',
          make: 'Hyundai',
          model: 'Sonata',
          year: 2013,
          url: 'https://auto.ria.com/uk/auto_hyundai_sonata_40143820.html',
          askingAmount: 8000,
          currency: 'USD',
        },
        cohort: { key: 'mark:1|model:2', tier: 'make_model', sampleSize: 12, mileageAware: false },
        fairValueBase: 10000,
        fairValueAdjusted: 9500,
        mileageAdjustment: -500,
        discountPct: 16,
        raw: 0.53,
        confidence: 1,
        penalty: 1,
        score: 0.53,
        priceCore: 0.53,
        total100: 77,
        factors: [],
        firedFlags: [],
        redFlags: {},
        reason: 'deal score 0.53 >= threshold 0.4',
        isOpportunity: true,
        disqualified: false,
      },
    });

    const ctx = buildContext('/why https://auto.ria.com/uk/auto_hyundai_sonata_40143820.html');
    await update.onWhy(ctx);

    expect(query.whyById).toHaveBeenCalledWith('40143820');
    expect(query.assessById).not.toHaveBeenCalled();
    expect(ctx.reply.mock.calls[0][0]).toContain('ParameterSet v3');
  });

  it('renders the read-only /budget report', async () => {
    const { update, query } = buildUpdate();
    (query as unknown as { budgetReport: jest.Mock }).budgetReport.mockResolvedValue({
      poolUsed: 10,
      poolSize: 20000,
      poolRemaining: 19990,
      dailyUsed: 10,
      dailyBudget: 1000,
      dailyRemaining: 990,
      reserveActive: 3000,
      reserveAmount: 3000,
      reserveReleased: false,
      ledgerAllowed: 10,
      reconciliationDifference: 0,
      forecastMonthEnd: 21,
      operationActual: [],
      profileActual: [],
      deferred: [],
      rolloutReady: true,
      rolloutReason: 'потрібне ручне схвалення reforecast',
    });
    const ctx = buildContext('/budget');
    await update.onBudget(ctx);
    expect((query as unknown as { budgetReport: jest.Mock }).budgetReport).toHaveBeenCalled();
    expect(ctx.reply.mock.calls[0][0]).toContain('Бюджет AUTO.RIA');
  });
});
