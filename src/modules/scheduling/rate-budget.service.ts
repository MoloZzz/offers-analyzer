import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { MoreThanOrEqual, Repository } from 'typeorm';

import { AppConfig } from '../../common/config/configuration';

import { buildBudgetReport, BudgetReportDigest } from './budget-report';
import {
  BudgetActivity,
  BudgetChargeStatus,
  BudgetDenialReason,
  BudgetOperation,
} from './entities/budget-activity.entity';
import { MonthlyBudgetState } from './entities/monthly-budget-state.entity';
import { OperationBudgetState } from './entities/operation-budget-state.entity';
import { RateBudgetWindow } from './entities/rate-budget-window.entity';
import { SourceControlService } from './source-control.service';

// How long to pause all consumption after the source returns HTTP 429, before
// retrying. Keeps us from hammering an upstream that just told us to back off.
const EXHAUSTED_COOLDOWN_MS = 5 * 60_000; // 5 minutes

/**
 * SPEC-017: advisory analysis is ledgered under its own source key, so its spend can never
 * decrement the 20,000-request AUTO.RIA pool (FR-006, SC-002) even by accident.
 */
export const AI_ANALYSIS_SOURCE_KEY = 'ai-analysis';

/** Operations admitted through an atomic per-operation allocation rather than the source pool. */
const ALLOCATED_OPERATIONS: readonly BudgetOperation[] = ['valuation_ai', 'ai_analysis'];

export interface BudgetRequestContext {
  operation: BudgetOperation;
  profileId?: string;
  profileName?: string;
  /** Telegram chat id of the admin who triggered a human-triggered operation. */
  actorId?: string;
  /** Canonical redacted provider input identity; used only by provider-backed operations. */
  requestFingerprint?: string;
  /** Billing observation supplied by a provider-backed caller before an outbound request. */
  chargeStatus?: BudgetChargeStatus;
  /**
   * Explicit per-month cap for a provider-backed operation. Legacy operations intentionally ignore
   * this field and retain the existing source-level monthly-pool behavior.
   */
  operationMonthlyAllocation?: number;
}

/**
 * Narrow request contract for the AUTO.RIA AI shadow path. Its positive allocation is required so
 * a call cannot consume the shared source pool merely because the provider was accidentally wired.
 */
export interface ValuationAiBudgetRequestContext extends BudgetRequestContext {
  operation: 'valuation_ai';
  requestFingerprint: string;
  operationMonthlyAllocation: number;
}

/** Admin-triggered advisory analysis. The actor is required — the rate limit is counted from it. */
export interface AiAnalysisBudgetRequestContext extends BudgetRequestContext {
  operation: 'ai_analysis';
  actorId: string;
  operationMonthlyAllocation: number;
  /** Max admissions for one admin inside `perAdminWindowHours`; zero disables the operation. */
  perAdminLimit: number;
  perAdminWindowHours: number;
}

export interface AiAnalysisAdmission {
  admitted: boolean;
  reason: BudgetDenialReason;
  /** Populated on a per-admin denial so the refusal can name the limit (US17.4 AS-4). */
  perAdminLimit?: number;
  perAdminWindowHours?: number;
  /** Populated on an allocation denial so the refusal can name the cap and its reset (AS-2). */
  allocation?: number;
  resetsAt?: Date;
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
    private readonly sourceControl?: SourceControlService,
    @InjectRepository(OperationBudgetState)
    private readonly operationStateRepo?: Repository<OperationBudgetState>,
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
    const dailyLimitEnabled =
      !this.sourceControl || (await this.sourceControl.isDailyLimitEnabled(sourceKey));

    // Get current monthly state
    const state = await this.getMonthlyBudgetState(sourceKey, now);

    // Check tier cutoff (if budget is tight, deny lower-priority tiers)
    const dailyUsed = state.dailyUsed ?? 0;
    const cutoffTier = dailyLimitEnabled ? this.determineCutoffTier(dailyBudget, dailyUsed) : null;
    if (dailyLimitEnabled && cutoffTier != null && tier > cutoffTier) {
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
    if (dailyLimitEnabled && dailyUsed + cost > dailyBudget) {
      this.logger.warn({ sourceKey, dailyUsed, dailyBudget, cost }, 'Daily budget exhausted');
      await this.recordActivity(sourceKey, cost, tier, context, 'denied', 'daily_exhausted', now);
      return false;
    }

    // All checks passed — consume and record
    // The source pool is shared by all operations. The provider sidecar additionally needs an
    // atomic per-operation cap so it cannot crowd out discovery merely because source capacity
    // remains. Legacy operations deliberately take this no-op branch.
    const allocationDenial = await this.reserveOperationAllocation(sourceKey, cost, context, now);
    if (allocationDenial) {
      this.logger.warn(
        {
          sourceKey,
          operation: context.operation,
          allocation: context.operationMonthlyAllocation ?? null,
          cost,
        },
        'Operation allocation denied consumption',
      );
      await this.recordActivity(sourceKey, cost, tier, context, 'denied', allocationDenial, now);
      return false;
    }

    const allocationReserved = context.operation === 'valuation_ai';
    try {
      const sourceDenial = await this.recordConsumption(
        sourceKey,
        cost,
        tier,
        dailyLimitEnabled,
        now,
      );
      if (sourceDenial) {
        this.logger.warn(
          { sourceKey, cost, tier, reason: sourceDenial },
          'Atomic source budget admission denied consumption',
        );
        if (allocationReserved) {
          await this.releaseOperationAllocation(sourceKey, cost, context.operation, now);
        }
        await this.recordActivity(sourceKey, cost, tier, context, 'denied', sourceDenial, now);
        return false;
      }

      await this.recordActivity(sourceKey, cost, tier, context, 'allowed', 'allowed', now);
      return true;
    } catch (error) {
      // The provider request has not been made when accounting fails. Returning the operation
      // reservation avoids permanently consuming shadow capacity for a failed admission path.
      if (allocationReserved) {
        await this.releaseOperationAllocation(sourceKey, cost, context.operation, now);
      }
      throw error;
    }
  }

  /**
   * SPEC-017 T011/T012 — admission for one admin-triggered advisory analysis.
   *
   * Deliberately **not** routed through `tryConsume`: that method admits against the shared AUTO.RIA
   * monthly pool and daily sub-budget, and charging an AI call there would decrement discovery
   * capacity (the thing FR-006 and SC-002 forbid). This path touches only the dedicated allocation
   * under `AI_ANALYSIS_SOURCE_KEY`, and every outcome — admitted or refused — is ledgered so
   * `/budget` and `/ai_audit` see the same evidence.
   *
   * Order matters: the per-admin limit is checked before the allocation is reserved, so a rate-
   * limited tap cannot consume monthly capacity it was never going to be allowed to use.
   */
  async tryConsumeAiAnalysis(
    context: AiAnalysisBudgetRequestContext,
    now = new Date(),
  ): Promise<AiAnalysisAdmission> {
    const cost = 1;
    if (!isPositiveInteger(context.operationMonthlyAllocation)) {
      // A zero (or absent) allocation is the kill switch, not an error state (FR-007).
      await this.recordActivity(
        AI_ANALYSIS_SOURCE_KEY,
        cost,
        1,
        context,
        'denied',
        'operation_allocation_exhausted',
        now,
      );
      return {
        admitted: false,
        reason: 'operation_allocation_exhausted',
        allocation: 0,
        resetsAt: RateBudgetService.nextMonthStart(now),
      };
    }

    const perAdminDenial = await this.perAdminLimitReached(context, now);
    if (perAdminDenial) {
      await this.recordActivity(
        AI_ANALYSIS_SOURCE_KEY,
        cost,
        1,
        context,
        'denied',
        'per_admin_rate_limited',
        now,
      );
      return {
        admitted: false,
        reason: 'per_admin_rate_limited',
        perAdminLimit: context.perAdminLimit,
        perAdminWindowHours: context.perAdminWindowHours,
      };
    }

    const denial = await this.reserveOperationAllocation(AI_ANALYSIS_SOURCE_KEY, cost, context, now);
    if (denial) {
      this.logger.warn(
        { operation: context.operation, allocation: context.operationMonthlyAllocation },
        'AI analysis allocation denied consumption',
      );
      await this.recordActivity(AI_ANALYSIS_SOURCE_KEY, cost, 1, context, 'denied', denial, now);
      return {
        admitted: false,
        reason: denial,
        allocation: context.operationMonthlyAllocation,
        resetsAt: RateBudgetService.nextMonthStart(now),
      };
    }

    await this.recordActivity(AI_ANALYSIS_SOURCE_KEY, cost, 1, context, 'allowed', 'allowed', now);
    return { admitted: true, reason: 'allowed' };
  }

  /**
   * Returns the dedicated AI allocation and what has been drawn against it. Read-only; it is the
   * input to `/budget`'s separate AI line (SC-007) and never folds into the AUTO.RIA reconciliation.
   */
  async aiAnalysisAllocation(
    now = new Date(),
  ): Promise<{ allocation: number; used: number } | null> {
    if (!this.operationStateRepo) return null;
    const state = await this.operationStateRepo.findOne({
      where: {
        sourceKey: AI_ANALYSIS_SOURCE_KEY,
        monthKey: RateBudgetService.monthKey(now),
        operation: 'ai_analysis',
      },
    });
    return state ? { allocation: state.capacity, used: state.used } : null;
  }

  /** Compensates a reserved AI admission when the attempt never reached the provider. */
  async releaseAiAnalysis(now = new Date()): Promise<void> {
    await this.releaseOperationAllocation(AI_ANALYSIS_SOURCE_KEY, 1, 'ai_analysis', now);
  }

  private async perAdminLimitReached(
    context: AiAnalysisBudgetRequestContext,
    now: Date,
  ): Promise<boolean> {
    if (!this.activityRepo) return false;
    if (!isPositiveInteger(context.perAdminLimit)) return true;
    const windowStart = new Date(
      now.getTime() - Math.max(1, context.perAdminWindowHours) * 60 * 60 * 1000,
    );
    const used = await this.activityRepo.count({
      where: {
        sourceKey: AI_ANALYSIS_SOURCE_KEY,
        operation: 'ai_analysis',
        outcome: 'allowed',
        actorId: context.actorId,
        createdAt: MoreThanOrEqual(windowStart),
      },
    });
    return used >= context.perAdminLimit;
  }

  /** Read-only SPEC-009 report; it does not touch a listing source or consume budget. */
  async report(sourceKey = 'auto-ria', now = new Date()): Promise<BudgetReportDigest | null> {
    const monthKey = RateBudgetService.monthKey(now);
    const state = await this.stateRepo.findOne({ where: { sourceKey, monthKey } });
    if (!state) return null;
    const activities = this.activityRepo
      ? await this.activityRepo.find({ where: { sourceKey, monthKey } })
      : [];
    const operationStates = this.operationStateRepo
      ? await this.operationStateRepo.find({ where: { sourceKey, monthKey } })
      : [];
    // Read from the AI source key separately and keep it out of the reconciliation inputs: folding
    // those rows into `activities` would make `ledgerAllowed` disagree with the AUTO.RIA counter and
    // report a phantom drift (SC-007).
    const aiState = this.operationStateRepo
      ? ((await this.operationStateRepo.findOne({
          where: { sourceKey: AI_ANALYSIS_SOURCE_KEY, monthKey, operation: 'ai_analysis' },
        })) ?? null)
      : null;
    const aiActivities = this.activityRepo
      ? await this.activityRepo.find({ where: { sourceKey: AI_ANALYSIS_SOURCE_KEY, monthKey } })
      : [];
    return buildBudgetReport(state, activities, now, operationStates, {
      state: aiState,
      activities: aiActivities,
    });
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

    // Recalculate for today. This conditional update is deliberately source-of-truth based rather
    // than a full-entity save: concurrent processes can race at UTC midnight without a late reset
    // erasing consumption already admitted for the new day.
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

    await this.stateRepo.query(
      `UPDATE monthly_budget_states
       SET "dailyBudget" = FLOOR(
             GREATEST(0, "poolSize" - "poolUsed" - $3)::numeric / $4
           ),
           "dailyUsed" = 0,
           "lastDayCalculated" = $5,
           "updatedAt" = now()
       WHERE "sourceKey" = $1
         AND "monthKey" = $2
         AND "lastDayCalculated" IS DISTINCT FROM $5`,
      [sourceKey, RateBudgetService.monthKey(now), effectiveReserve, daysRemaining, todayStr],
    );

    const refreshed = await this.stateRepo.findOne({
      where: { sourceKey, monthKey: RateBudgetService.monthKey(now) },
    });
    return refreshed?.dailyBudget ?? 0;
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

  /**
   * Atomically admits one source request against the shared monthly pool and today's sub-budget.
   * The predicate is evaluated under the UPDATE row lock, so concurrent callers cannot turn a
   * stale preflight read into an over-cap source request.
   */
  private async recordConsumption(
    sourceKey: string,
    cost: number,
    tier: number,
    dailyLimitEnabled: boolean,
    now: Date,
    retryAfterDailyReset = true,
  ): Promise<BudgetDenialReason | null> {
    const monthKey = RateBudgetService.monthKey(now);
    const todayStr = RateBudgetService.todayStr(now);

    const admissionResult: unknown = await this.stateRepo.query(
      `UPDATE monthly_budget_states
       SET "poolUsed" = "poolUsed" + $3,
           "dailyUsed" = "dailyUsed" + $3,
           "updatedAt" = now()
       WHERE "sourceKey" = $1
         AND "monthKey" = $2
         AND "lastDayCalculated" = $4
         AND "poolUsed" + $3 <= "poolSize"
         AND (NOT $5::boolean OR "dailyUsed" + $3 <= "dailyBudget")
         AND (
           NOT $5::boolean
           OR CASE
             WHEN "dailyBudget" - "dailyUsed" <= 0 THEN $6 <= 1
             WHEN "dailyBudget" - "dailyUsed" <= CEIL("dailyBudget" * $7 / 100.0) * 0.25
               THEN $6 <= 2
             WHEN "dailyBudget" - "dailyUsed" <= CEIL("dailyBudget" * $7 / 100.0) * 0.5
               THEN $6 <= 3
             WHEN "dailyBudget" - "dailyUsed" <= CEIL("dailyBudget" * $7 / 100.0) * 0.75
               THEN $6 <= 4
             ELSE TRUE
           END
         )
       RETURNING "id"`,
      [sourceKey, monthKey, cost, todayStr, dailyLimitEnabled, tier, this.cutoffThresholdPct],
    );

    if (hasReturnedRows(admissionResult)) {
      this.logger.debug({ sourceKey, cost, tier, month: monthKey }, 'Consumed budget');
      return null;
    }

    const state = await this.getMonthlyBudgetState(sourceKey, now);
    if (state.lastDayCalculated !== todayStr && retryAfterDailyReset) {
      await this.ensureDailyBudgetCalculated(sourceKey, now);
      return this.recordConsumption(sourceKey, cost, tier, dailyLimitEnabled, now, false);
    }

    return this.sourceAdmissionDenial(state, cost, tier, dailyLimitEnabled);
  }

  /** Mirrors the atomic UPDATE predicate so a rejected race retains the legacy denial reason. */
  private sourceAdmissionDenial(
    state: MonthlyBudgetState,
    cost: number,
    tier: number,
    dailyLimitEnabled: boolean,
  ): BudgetDenialReason {
    const dailyBudget = state.dailyBudget ?? 0;
    const dailyUsed = state.dailyUsed ?? 0;
    if (dailyLimitEnabled) {
      const cutoffTier = this.determineCutoffTier(dailyBudget, dailyUsed);
      if (cutoffTier != null && tier > cutoffTier) return 'tier_cutoff';
    }
    if ((state.poolUsed ?? 0) + cost > state.poolSize) return 'monthly_exhausted';
    if (dailyLimitEnabled && dailyUsed + cost > dailyBudget) return 'daily_exhausted';

    return 'admission_contention';
  }

  /**
   * Atomically reserves the dedicated valuation-provider allocation. The INSERT ... ON CONFLICT
   * statement makes first-use and concurrent updates one admission operation, avoiding a
   * read-modify-write race that could overrun the cap.
   */
  private async reserveOperationAllocation(
    sourceKey: string,
    cost: number,
    context: BudgetRequestContext,
    now: Date,
  ): Promise<BudgetDenialReason | null> {
    if (!ALLOCATED_OPERATIONS.includes(context.operation)) return null;

    const capacity = context.operationMonthlyAllocation;
    if (!isPositiveInteger(capacity) || !isPositiveInteger(cost)) {
      return 'operation_allocation_exhausted';
    }
    if (!this.operationStateRepo) {
      return 'operation_allocation_unavailable';
    }

    try {
      const admissionResult: unknown = await this.operationStateRepo.query(
        `INSERT INTO operation_budget_states
           ("sourceKey", "monthKey", "operation", "capacity", "used")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("sourceKey", "monthKey", "operation")
         DO UPDATE SET
           "capacity" = EXCLUDED."capacity",
           "used" = operation_budget_states."used" + EXCLUDED."used",
           "updatedAt" = now()
         WHERE operation_budget_states."used" + EXCLUDED."used" <= EXCLUDED."capacity"
         RETURNING "id"`,
        [sourceKey, RateBudgetService.monthKey(now), context.operation, capacity, cost],
      );
      return hasReturnedRows(admissionResult) ? null : 'operation_allocation_exhausted';
    } catch (error) {
      this.logger.error(
        { err: error, sourceKey, operation: context.operation },
        'Operation allocation admission unavailable',
      );
      return 'operation_allocation_unavailable';
    }
  }

  /** Best-effort compensation when local accounting fails before an outbound provider request. */
  private async releaseOperationAllocation(
    sourceKey: string,
    cost: number,
    operation: BudgetOperation,
    now: Date,
  ): Promise<void> {
    if (!ALLOCATED_OPERATIONS.includes(operation) || !this.operationStateRepo) return;
    try {
      await this.operationStateRepo.query(
        `UPDATE operation_budget_states
         SET "used" = GREATEST(0, "used" - $4), "updatedAt" = now()
         WHERE "sourceKey" = $1 AND "monthKey" = $2 AND "operation" = $3`,
        [sourceKey, RateBudgetService.monthKey(now), operation, cost],
      );
    } catch (error) {
      this.logger.error(
        { err: error, sourceKey, operation },
        'Operation allocation compensation failed',
      );
    }
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
        actorId: context.actorId ?? null,
        cost,
        outcome,
        reason,
        requestFingerprint: context.requestFingerprint ?? null,
        chargeStatus:
          isPaidOperation(context.operation) && outcome === 'denied'
            ? 'not_charged'
            : (context.chargeStatus ??
              (isPaidOperation(context.operation) ? 'unknown' : 'not_applicable')),
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

  /** When a monthly allocation resets — named in an exhaustion refusal (US17.4 AS-2). */
  private static nextMonthStart(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  }
}

/** Operations that spend real money with an external provider rather than source-pool requests. */
function isPaidOperation(operation: BudgetOperation): boolean {
  return operation === 'valuation_ai' || operation === 'ai_analysis';
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function isPositiveInteger(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function hasReturnedRows(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}
