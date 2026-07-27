import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Repository } from 'typeorm';

import { AppConfig } from '../../common/config/configuration';

import { MonthlyBudgetState } from './entities/monthly-budget-state.entity';
import {
  BudgetActivity,
  BudgetDenialReason,
  BudgetOperation,
} from './entities/budget-activity.entity';
import { RateBudgetWindow } from './entities/rate-budget-window.entity';
import { buildBudgetReport, BudgetReportDigest } from './budget-report';

// How long to pause all consumption after the source returns HTTP 429, before
// retrying. Keeps us from hammering an upstream that just told us to back off.
const EXHAUSTED_COOLDOWN_MS = 5 * 60_000; // 5 minutes

export interface BudgetRequestContext {
  operation: BudgetOperation;
  profileId?: string;
  profileName?: string;
}

/**
 * ADR-0009: Monthly pool + daily sub-budget + priority queue rate limiting.
 * Replaces fixed hourly window (30 req/hour) with flexible monthly pool (20,000 req/month).
 * Supports 5-tier priority cutoff: tier-1 (price-drop checks) → tier-5 (cohort averages).
 * Durable Postgres-backed counter survives restarts; see ADR-0004 (B13).
 */
@Injectable()
export class RateBudgetService {
  private readonly capacityPerHour: number;
  private readonly poolPerMonth: number;
  private readonly reservePct: number;
  private readonly cutoffThresholdPct: number;
  private pausedUntil: number | null = null;

  constructor(
    config: ConfigService<AppConfig, true>,
    @InjectRepository(RateBudgetWindow) private readonly windowRepo: Repository<RateBudgetWindow>,
    @InjectRepository(MonthlyBudgetState)
    private readonly stateRepo: Repository<MonthlyBudgetState>,
    @InjectPinoLogger(RateBudgetService.name) private readonly logger: PinoLogger,
    @InjectRepository(BudgetActivity) private readonly activityRepo?: Repository<BudgetActivity>,
  ) {
    this.capacityPerHour = config.get('rateBudgetPerHour', { infer: true });
    this.poolPerMonth = config.get('rateBudgetPoolPerMonth', { infer: true });
    this.reservePct = config.get('rateBudgetReservePct', { infer: true });
    this.cutoffThresholdPct = config.get('rateBudgetCutoffThresholdPct', { infer: true });
  }

  /**
   * Try to consume `cost` units. Returns false if denied (budget exhausted or tier cutoff).
   * Supports both legacy hourly mode (if still configured) and new monthly pool mode (ADR-0009).
   * Optional tier (1-5) for priority queue; defaults to tier-1 (highest priority).
   */
  async tryConsume(
    sourceKey = 'auto-ria',
    cost = 1,
    tier = 1,
    context: BudgetRequestContext = { operation: 'on_demand' },
  ): Promise<boolean> {
    const now = new Date();
    // If we were recently 429'd, stay paused until the cooldown elapses.
    if (this.pausedUntil != null) {
      if (Date.now() < this.pausedUntil) {
        this.logger.warn(
          { sourceKey, pausedUntil: this.pausedUntil },
          'Rate budget paused after HTTP 429, denying consumption',
        );
        await this.recordActivity(sourceKey, cost, tier, context, 'denied', 'cooldown', now);
        return false;
      }
      this.pausedUntil = null;
    }

    // Ensure daily budget is calculated for today (on-demand reset if date changed)
    const dailyBudget = await this.ensureDailyBudgetCalculated(sourceKey, now);

    // Get current monthly state
    const state = await this.getMonthlyBudgetState(sourceKey, now);

    // Check tier cutoff (if budget is tight, deny lower-priority tiers)
    const dailyUsed = state.dailyUsed ?? 0;
    const cutoffTier = this.determineCutoffTier(dailyBudget, dailyUsed);
    if (cutoffTier != null && tier > cutoffTier) {
      this.logger.warn(
        { sourceKey, tier, cutoffTier, dailyUsed, dailyBudget },
        `Tier ${tier} denied (budget tight, cutoff at ${cutoffTier})`,
      );
      await this.recordActivity(sourceKey, cost, tier, context, 'denied', 'tier_cutoff', now);
      return false;
    }

    // Check monthly pool exhaustion
    if ((state.poolUsed ?? 0) + cost > state.poolSize) {
      this.logger.warn(
        { sourceKey, poolUsed: state.poolUsed, poolSize: state.poolSize },
        'Monthly pool exhausted',
      );
      await this.recordActivity(sourceKey, cost, tier, context, 'denied', 'monthly_exhausted', now);
      return false;
    }

    // Check daily budget exhaustion
    if (dailyUsed + cost > dailyBudget) {
      this.logger.warn({ sourceKey, dailyUsed, dailyBudget, cost }, 'Daily budget exhausted');
      await this.recordActivity(sourceKey, cost, tier, context, 'denied', 'daily_exhausted', now);
      return false;
    }

    // All checks passed — consume and record
    const allowed = await this.recordConsumption(sourceKey, cost, tier, now);
    if (allowed)
      await this.recordActivity(sourceKey, cost, tier, context, 'allowed', 'allowed', now);
    return allowed;
  }

  /** Read-only SPEC-009 report; it does not touch a listing source or consume budget. */
  async report(sourceKey = 'auto-ria', now = new Date()): Promise<BudgetReportDigest | null> {
    const monthKey = RateBudgetService.monthKey(now);
    const state = await this.stateRepo.findOne({ where: { sourceKey, monthKey } });
    if (!state) return null;
    const activities = this.activityRepo
      ? await this.activityRepo.find({ where: { sourceKey, monthKey } })
      : [];
    return buildBudgetReport(state, activities, now);
  }

  /** Remaining calls in the current hour window (legacy hourly mode). */
  async remaining(sourceKey = 'auto-ria'): Promise<number> {
    const row = await this.windowRepo.findOne({
      where: { sourceKey, windowKey: RateBudgetService.hourlyWindowKey() },
    });
    return Math.max(0, this.capacityPerHour - (row?.used ?? 0));
  }

  /** Force the current window to exhausted (e.g. the source returned HTTP 429). */
  async markExhausted(sourceKey = 'auto-ria'): Promise<void> {
    const windowKey = RateBudgetService.hourlyWindowKey();
    await this.windowRepo.query(
      `INSERT INTO rate_budget_windows ("sourceKey", "windowKey", "used", "budgetType")
       VALUES ($1, $2, $3, 'hourly')
       ON CONFLICT ("sourceKey", "windowKey")
       DO UPDATE SET "used" = GREATEST(rate_budget_windows."used", $3)`,
      [sourceKey, windowKey, this.capacityPerHour],
    );
    this.pausedUntil = Date.now() + EXHAUSTED_COOLDOWN_MS;
  }

  /** Get or lazily initialize monthly budget state for the given month. */
  private async getMonthlyBudgetState(sourceKey: string, now: Date): Promise<MonthlyBudgetState> {
    const monthKey = RateBudgetService.monthKey(now);

    let state = await this.stateRepo.findOne({ where: { sourceKey, monthKey } });

    if (!state) {
      // Lazy initialization: first call of the month creates the row
      const monthStart = RateBudgetService.monthStart(now);
      const monthEnd = new Date(monthStart);
      monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

      const reserveAmount = Math.round(this.poolPerMonth * (this.reservePct / 100));
      const releaseDate = new Date(monthEnd);
      releaseDate.setUTCDate(releaseDate.getUTCDate() - 3); // 3 days before month end

      state = this.stateRepo.create({
        sourceKey,
        monthKey,
        poolSize: this.poolPerMonth,
        poolUsed: 0,
        reserveAmount,
        reserveReleasesAt: releaseDate,
        dailyBudget: 0,
        dailyUsed: 0,
        lastDayCalculated: null,
      });
      state = await this.stateRepo.save(state);
    }

    return state;
  }

  /** Recalculate daily budget if date has changed since last calculation. */
  private async ensureDailyBudgetCalculated(sourceKey: string, now: Date): Promise<number> {
    const state = await this.getMonthlyBudgetState(sourceKey, now);
    const todayStr = RateBudgetService.todayStr(now);

    // If already calculated for today, reuse the value
    if (state.lastDayCalculated === todayStr) {
      return state.dailyBudget ?? 0;
    }

    // Recalculate for today
    const monthStart = RateBudgetService.monthStart(now);
    const monthEnd = new Date(monthStart);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

    // Days remaining in month (inclusive of today)
    const daysRemaining = Math.max(
      1,
      Math.ceil((monthEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
    );

    // Determine effective reserve (released 3 days before month end)
    const effectiveReserve = now >= state.reserveReleasesAt ? 0 : state.reserveAmount;

    // Daily budget = (pool remaining - effective reserve) / days remaining
    const availablePool = Math.max(0, state.poolSize - (state.poolUsed ?? 0) - effectiveReserve);
    const dailyBudget = Math.floor(availablePool / daysRemaining);

    // Update state: reset daily used and save new budget.
    // Use a targeted column update (not a full-entity save) so we never clobber
    // `poolUsed`, which may be concurrently incremented by an atomic SQL update
    // in recordConsumption() between our read above and this write (TOCTOU).
    await this.stateRepo.update(
      { sourceKey, monthKey: RateBudgetService.monthKey(now) },
      { dailyBudget, dailyUsed: 0, lastDayCalculated: todayStr },
    );

    return dailyBudget;
  }

  /** Determine cutoff tier based on remaining daily budget (progressive denial from tier-5 to tier-2). */
  private determineCutoffTier(dailyBudget: number, dailyUsed: number): number | null {
    const remaining = dailyBudget - dailyUsed;
    const threshold = Math.ceil(dailyBudget * (this.cutoffThresholdPct / 100));

    // Budget is comfortable, no cutoff
    if (remaining > threshold) {
      return null;
    }

    // Progressive cutoff (deny tier-5, then tier-4, etc., but never deny tier-1)
    if (remaining <= 0) return 1; // Deny tiers 5, 4, 3, 2; allow only tier-1
    if (remaining <= threshold * 0.25) return 2; // Deny tiers 5, 4, 3
    if (remaining <= threshold * 0.5) return 3; // Deny tiers 5, 4
    if (remaining <= threshold * 0.75) return 4; // Deny tier 5

    return null;
  }

  /** Record consumption: update both monthly pool and daily budget. */
  private async recordConsumption(
    sourceKey: string,
    cost: number,
    tier: number,
    now: Date,
  ): Promise<boolean> {
    const monthKey = RateBudgetService.monthKey(now);
    const todayStr = RateBudgetService.todayStr(now);

    // Update monthly pool consumption
    await this.stateRepo.query(
      `UPDATE monthly_budget_states
       SET "poolUsed" = "poolUsed" + $3,
           "dailyUsed" = CASE WHEN "lastDayCalculated" = $4 THEN "dailyUsed" + $3 ELSE $3 END,
           "lastDayCalculated" = CASE WHEN "lastDayCalculated" <> $4 THEN $4 ELSE "lastDayCalculated" END,
           "updatedAt" = now()
       WHERE "sourceKey" = $1 AND "monthKey" = $2`,
      [sourceKey, monthKey, cost, todayStr],
    );

    // Log consumption for diagnostics
    this.logger.debug({ sourceKey, cost, tier, month: monthKey }, 'Consumed budget');

    return true;
  }

  private async recordActivity(
    sourceKey: string,
    cost: number,
    priorityTier: number,
    context: BudgetRequestContext,
    outcome: 'allowed' | 'denied',
    reason: BudgetDenialReason,
    now: Date,
  ): Promise<void> {
    if (!this.activityRepo) return;
    await this.activityRepo.save(
      this.activityRepo.create({
        sourceKey,
        monthKey: RateBudgetService.monthKey(now),
        operation: context.operation,
        priorityTier,
        profileId: context.profileId ?? null,
        profileName: context.profileName ?? null,
        cost,
        outcome,
        reason,
      }),
    );
  }

  // Helper: Legacy hourly window key (YYYYMMDDHH format)
  private static hourlyWindowKey(): string {
    const now = new Date();
    return (
      `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
      `${pad(now.getUTCHours())}`
    );
  }

  // Helper: Monthly window key (YYYYMM format)
  private static monthKey(now: Date): string {
    return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}`;
  }

  // Helper: Today's date string (YYYY-MM-DD format)
  private static todayStr(now: Date): string {
    return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  }

  // Helper: Start of month (first day at 00:00 UTC)
  private static monthStart(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
