import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { MoreThanOrEqual, Repository } from 'typeorm';

import { AppConfig } from '../../common/config/configuration';
import { Listing } from '../listings/entities/listing.entity';
import { AiAnalysisAdmission, RateBudgetService } from '../scheduling/rate-budget.service';
import { HeuristicTablesService } from '../valuation/factors/tables';

import {
  AiAnalysisAuditDigest,
  buildAiAnalysisAudit,
  toAuditRecord,
} from './ai-analysis-audit';
import { buildAnalysisContext } from './analysis-context';
import {
  detectRepairRiskContradiction,
  RepairRiskContradiction,
} from './analysis-contradiction';
import { validateAnalysisOutput } from './analysis-output';
import { ANALYSIS_V1_POLICY } from './analysis-policy';
import { AnalysisStatus, AnalysisTerminalReason } from './analysis.types';
import { AiAnalysis } from './entities/ai-analysis.entity';
import { ANALYSIS_PROVIDER, AnalysisProvider } from './ports/analysis-provider.port';

/**
 * SPEC-017 T022 — one attempt, one record.
 *
 * The order is fixed and each step is a gate on the next: **admission → assemble → call → validate
 * → persist**. Admission first, because an unadmitted tap must never construct a provider request;
 * validation before persistence of an output, because a schema-invalid answer is stored as a failed
 * attempt rather than as content (FR-004, FR-008).
 *
 * Every terminal path — refusal, provider failure, invalid output, success — writes exactly one
 * immutable row (SC-006). A refusal is an attempt too: "we declined to spend" is the fact
 * `/ai_audit` most needs, and a silent refusal would be invisible to the audit surface.
 *
 * FR-001 lives here structurally: `analyze` requires an `actorId` and there is no scheduled, batch,
 * or poll-time caller anywhere in the codebase (asserted by `analysis-module-boundary.spec.ts`).
 */
export type AnalysisAttempt =
  | { status: 'listing_missing' }
  | {
      status: 'refused';
      reason: AnalysisTerminalReason;
      record: AiAnalysis | null;
      admission?: AiAnalysisAdmission;
    }
  | { status: 'failed'; reason: AnalysisTerminalReason; record: AiAnalysis; listing: Listing }
  | {
      status: 'available';
      record: AiAnalysis;
      listing: Listing;
      contradiction: RepairRiskContradiction | null;
    }
  /** Served from a stored record: no provider request, no budget charged (FR-005). */
  | {
      status: 'cached';
      record: AiAnalysis;
      listing: Listing;
      contradiction: RepairRiskContradiction | null;
    };

@Injectable()
export class AnalysisService {
  /**
   * SPEC-017 T029. Two admins tapping the same listing within the same second both miss the stored
   * cache — there is nothing to hit yet — so the second is joined to the first attempt rather than
   * starting its own. Same process only, which is the shape of the risk here: the trigger is a human
   * tap on one bot instance, not a fan-out across workers.
   */
  private readonly inFlight = new Map<string, Promise<AnalysisAttempt>>();

  private readonly enabled: boolean;
  private readonly monthlyAllocation: number;
  private readonly perAdminLimit: number;
  private readonly perAdminWindowHours: number;

  constructor(
    config: ConfigService<AppConfig, true>,
    @InjectRepository(Listing) private readonly listings: Repository<Listing>,
    @InjectRepository(AiAnalysis) private readonly analyses: Repository<AiAnalysis>,
    private readonly budget: RateBudgetService,
    @Inject(ANALYSIS_PROVIDER) private readonly provider: AnalysisProvider,
    @InjectPinoLogger(AnalysisService.name) private readonly logger: PinoLogger,
    private readonly tables: HeuristicTablesService,
  ) {
    this.enabled = config.get('aiAnalysisEnabled', { infer: true });
    this.monthlyAllocation = config.get('aiAnalysisMonthlyAllocation', { infer: true });
    this.perAdminLimit = config.get('aiAnalysisPerAdminLimit', { infer: true });
    this.perAdminWindowHours = config.get('aiAnalysisPerAdminWindowHours', { infer: true });
  }

  /**
   * One admin-triggered analysis. The listing may be named by its source id (a pasted link, the
   * `/analyze_ai` path) or by its local id (the inline button under an alert, T032) — both resolve
   * to the same stored listing and the same cache key, so the two entry points cannot diverge.
   */
  async analyze(input: {
    externalId?: string;
    listingId?: string;
    actorId: string;
  }): Promise<AnalysisAttempt> {
    const where = input.listingId
      ? { id: input.listingId }
      : input.externalId
        ? { externalId: input.externalId }
        : null;
    const listing = where ? await this.listings.findOne({ where }) : null;
    if (!listing) return { status: 'listing_missing' };

    const context = buildAnalysisContext({
      listing: {
        externalId: listing.externalId,
        make: listing.make,
        model: listing.model,
        year: listing.year,
        mileageK: listing.mileage ?? null,
        sellerType: listing.sellerType,
        vinPresent: Boolean(listing.vin),
        url: listing.url,
        askingAmount: listing.currentAmount,
        currency: listing.currentCurrency,
        description: listing.description ?? null,
        stateId: listing.stateId ?? null,
      },
      explanation: listing.lastExplanation ?? null,
      policy: ANALYSIS_V1_POLICY,
    });

    const persist = (
      status: AnalysisStatus,
      terminalReason: AnalysisTerminalReason,
      extra: Partial<AiAnalysis> = {},
    ): Promise<AiAnalysis> =>
      this.analyses.save(
        this.analyses.create({
          listingId: listing.id,
          inputFactHash: context.inputFactHash,
          promptVersion: context.promptVersion,
          modelId: this.provider.modelId,
          adapterVersion: this.provider.adapterVersion,
          samplingParams: {},
          factSnapshot: { facts: context.facts, untrustedText: context.untrustedText },
          status,
          terminalReason,
          actorId: input.actorId,
          ...extra,
        }),
      );

    // T027 — the cache is consulted **first**: before admission, so a hit charges nothing, and
    // before the kill switch, because serving a stored answer makes no provider request and reads
    // nothing but our own table. That ordering is what lets a stored analysis render in full with
    // the provider disabled and no network (SC-005) — the same contract `/why` has with SPEC-015.
    //
    // A hit writes a **marker** row: `status: 'cached'`, no `output` of its own (the record it
    // serves already holds it). Phase 4 wrote nothing here, which was cheaper but left the cheapest
    // invocations as the only invisible ones — and `/ai_audit` is specified to report a cache-hit
    // rate (T031). The marker is what makes that number exist, and it keeps FR-008 literally true:
    // every invocation has exactly one immutable record. Markers never satisfy a lookup, which
    // filters on `available`.
    const cached = await this.findCached(listing.id, context.inputFactHash);
    if (cached) {
      await persist('cached', 'ok');
      return {
        status: 'cached',
        record: cached,
        listing,
        contradiction: this.contradiction(listing, cached),
      };
    }

    // The key must carry everything the cache key carries. Coalescing two attempts that would
    // produce differently-keyed records would let one listing's answer satisfy another's request.
    const key = `${listing.id}:${context.inputFactHash}:${context.promptVersion}:${this.provider.modelId}`;
    const joined = this.inFlight.get(key);
    if (joined) {
      const shared = await joined;
      // The follower made no request and was charged nothing, so a success reaches it as a hit —
      // and is marked as one, for the same audit reason as a stored hit.
      if (shared.status !== 'available') return shared;
      await persist('cached', 'ok');
      return {
        status: 'cached',
        record: shared.record,
        listing,
        contradiction: shared.contradiction,
      };
    }

    const run = this.attempt(input, listing, context, persist).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, run);
    return run;
  }

  /**
   * The newest schema-valid answer for this exact `(listing, facts, prompt version, model)`. A
   * price change, description edit, or any changed source fact moves `inputFactHash`, so no explicit
   * invalidation path exists or is needed — and a prompt or model change cannot satisfy the old key.
   *
   * Failed attempts are deliberately not cached: a timeout or a schema violation says nothing about
   * the listing, and re-serving one would turn a transient provider fault into a permanent verdict.
   */
  private async findCached(listingId: string, inputFactHash: string): Promise<AiAnalysis | null> {
    return this.analyses.findOne({
      where: {
        listingId,
        inputFactHash,
        promptVersion: ANALYSIS_V1_POLICY.promptVersion,
        modelId: this.provider.modelId,
        status: 'available',
      },
      order: { capturedAt: 'DESC' },
    });
  }

  /**
   * SPEC-017 T033. Computed at **reply time**, not stored: the curated table is versioned config a
   * human edits, so the honest question is always "does this answer disagree with the table as it
   * stands now", not "as it stood when the answer was produced". A stored analysis whose claim the
   * table has since caught up with should stop being flagged.
   */
  private contradiction(listing: Listing, record: AiAnalysis): RepairRiskContradiction | null {
    if (!record.output) return null;
    return detectRepairRiskContradiction({
      make: listing.make,
      model: listing.model,
      year: listing.year,
      output: record.output,
      table: this.tables.get().repairRisk,
    });
  }

  /**
   * SPEC-017 T031 — admin-only audit over persisted attempts. Read-only, aggregate-only, and it
   * makes no provider request: `/ai_audit` is an accounting surface, not a second way to read an
   * analysis. The budget line comes from the dedicated `ai_analysis` allocation, never the
   * AUTO.RIA pool.
   */
  async audit(windowDays = 30): Promise<AiAnalysisAuditDigest> {
    const since = new Date(Date.now() - Math.max(1, windowDays) * 24 * 60 * 60 * 1000);
    const [rows, budget] = await Promise.all([
      this.analyses.find({ where: { capturedAt: MoreThanOrEqual(since) }, order: { capturedAt: 'DESC' } }),
      this.budget.aiAnalysisAllocation(),
    ]);
    return buildAiAnalysisAudit(rows.map(toAuditRecord), { windowDays, budget });
  }

  /** Admission → call → validate → persist. Reached only on a cache miss. */
  private async attempt(
    input: { actorId: string },
    listing: Listing,
    context: ReturnType<typeof buildAnalysisContext>,
    persist: (
      status: AnalysisStatus,
      terminalReason: AnalysisTerminalReason,
      extra?: Partial<AiAnalysis>,
    ) => Promise<AiAnalysis>,
  ): Promise<AnalysisAttempt> {
    // The kill switch, checked before anything is admitted or assembled into a request. A disabled
    // feature and an unconfigured provider are different facts and are recorded as different
    // terminal reasons, so `/ai_audit` can tell "we turned it off" from "it was never wired".
    if (!this.enabled || !this.provider.isConfigured()) {
      const reason: AnalysisTerminalReason = this.enabled ? 'not_configured' : 'disabled';
      return { status: 'refused', reason, record: await persist('refused', reason) };
    }

    const admission = await this.budget.tryConsumeAiAnalysis({
      operation: 'ai_analysis',
      actorId: input.actorId,
      operationMonthlyAllocation: this.monthlyAllocation,
      perAdminLimit: this.perAdminLimit,
      perAdminWindowHours: this.perAdminWindowHours,
    });
    if (!admission.admitted) {
      const reason: AnalysisTerminalReason =
        admission.reason === 'per_admin_rate_limited' ? 'rate_limited' : 'budget_exhausted';
      return {
        status: 'refused',
        reason,
        record: await persist('refused', reason),
        admission,
      };
    }

    const outcome = await this.provider.analyze({ context, policy: ANALYSIS_V1_POLICY });
    if (outcome.status === 'unavailable') {
      // Give the allocation back only when the provider cannot have billed for the attempt.
      // Guessing generously in the other direction would silently overspend a paid cap.
      if (!outcome.possiblyCharged) await this.budget.releaseAiAnalysis();
      this.logger.warn(
        { listingId: listing.id, reason: outcome.reason },
        'AI analysis attempt failed',
      );
      return {
        status: 'failed',
        reason: outcome.reason,
        listing,
        record: await persist('unavailable', outcome.reason, {
          samplingParams: outcome.samplingParams,
        }),
      };
    }

    const validated = validateAnalysisOutput(outcome.payload, ANALYSIS_V1_POLICY);
    if (!validated.ok) {
      // Discarded whole: nothing from the payload is stored as content, only the violation.
      return {
        status: 'failed',
        reason: 'schema_invalid',
        listing,
        record: await persist('invalid_output', 'schema_invalid', {
          samplingParams: outcome.samplingParams,
          violation: validated.violation,
        }),
      };
    }

    const record = await persist('available', 'ok', {
      samplingParams: outcome.samplingParams,
      output: validated.value,
    });
    return {
      status: 'available',
      listing,
      record,
      contradiction: this.contradiction(listing, record),
    };
  }
}
