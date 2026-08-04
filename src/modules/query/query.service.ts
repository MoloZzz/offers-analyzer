import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Repository } from 'typeorm';

import { AppConfig } from '../../common/config/configuration';
import { Currency } from '../../common/types/money';
import { marginStats } from '../calibration/deal-margin';
import { DealsService } from '../calibration/deals.service';
import { DealOutcome } from '../calibration/entities/deal-outcome.entity';
import { OutcomesService } from '../calibration/outcomes.service';
import { DisappearancesService } from '../listings/disappearances.service';
import { Listing } from '../listings/entities/listing.entity';
import { ListingsService } from '../listings/listings.service';
import type { BudgetReportDigest } from '../scheduling/budget-report';
import { RateBudgetService } from '../scheduling/rate-budget.service';
import { ListingDetail, ListingSource, LISTING_SOURCE } from '../sources/ports/listing-source.port';
import { BenchmarkCacheService } from '../valuation/benchmark-cache.service';
import { resolveBenchmark } from '../valuation/cohort';
import { Opportunity } from '../valuation/entities/opportunity.entity';
import { ValuationEvidence } from '../valuation/entities/valuation-evidence.entity';
import { isEvaluationExplanationV2 } from '../valuation/evaluation-explanation';
import { MileageAdjuster } from '../valuation/mileage';
import {
  buildValuationAuditDigest,
  ValuationAuditBudget,
  ValuationAuditDigest,
} from '../valuation/valuation-audit';
import { ValuationEvidenceService } from '../valuation/valuation-evidence.service';
import { ValuationShadowService } from '../valuation/valuation-shadow.service';
import { ValuationResult, ValuationService } from '../valuation/valuation.service';

import {
  AccidentShadowDigest,
  AccidentShadowRecord,
  buildAccidentShadowDigest,
} from './accident-shadow-report';
import { buildDigest, realizedPrecision, ReportDigest } from './report';

export interface Assessment {
  detail: ListingDetail;
  result: ValuationResult;
  fairValue: number;
  currency: Currency;
  sampleSize: number;
  benchmarkBase: number;
  mileageAware: boolean;
}

export interface WhyLookup {
  stored?: Listing['lastExplanation'];
  evidence?: ValuationEvidence | null;
  live?: Assessment;
}

export interface RankedOpportunity {
  opportunity: Opportunity;
  listing?: Listing;
}

/** Recent evaluation record for history command. */
export interface RecentEvaluation {
  listing: Listing;
  score: number;
  discountPct: number;
  evaluatedAt: Date;
}

/** A deal paired with its listing (for the /deals overview). */
export interface DealWithListing {
  deal: DealOutcome;
  listing?: Listing;
}

/** Read-mostly queries exposed to the Telegram bot (on-demand check, top deals, best candidates). */
@Injectable()
export class QueryService {
  private readonly minScore: number;
  private readonly minSamples: number;

  constructor(
    @Inject(LISTING_SOURCE) private readonly source: ListingSource,
    private readonly valuation: ValuationService,
    private readonly benchmarks: BenchmarkCacheService,
    private readonly listings: ListingsService,
    private readonly disappearances: DisappearancesService,
    private readonly mileage: MileageAdjuster,
    private readonly outcomes: OutcomesService,
    private readonly deals: DealsService,
    private readonly budget: RateBudgetService,
    @InjectRepository(Opportunity) private readonly opportunities: Repository<Opportunity>,
    config: ConfigService<AppConfig, true>,
    @Optional() private readonly valuationShadow?: ValuationShadowService,
    @Optional() private readonly valuationEvidence?: ValuationEvidenceService,
    @Optional()
    @InjectPinoLogger(QueryService.name)
    private readonly logger?: PinoLogger,
  ) {
    this.minScore = config.get('defaultMinDealScore', { infer: true });
    this.minSamples = config.get('defaultConfidenceMinSamples', { infer: true });
  }

  /** Fetch + evaluate a single listing on demand (spends budget). */
  async assessById(externalId: string): Promise<Assessment> {
    const detail = await this.source.fetch(externalId, 2, { operation: 'on_demand' });
    const benchmark = await resolveBenchmark(this.source, this.benchmarks, detail);
    const fairValue = benchmark ? this.mileage.fairValue(benchmark, detail) : 0;
    const currency = benchmark?.value.currency ?? Currency.USD;

    const result = this.valuation.evaluate({
      asking: detail.price.amount,
      fairValue,
      sampleSize: benchmark?.sampleSize ?? 0,
      minScore: this.minScore,
      minSamples: this.minSamples,
      make: detail.make,
      model: detail.model,
      gearbox: detail.gearbox,
      fuel: detail.fuel,
      engine: detail.engine,
      sellerType: detail.sellerType,
      hasVinReport: detail.hasVinReport,
      damaged: detail.risk.damaged,
      salvage: detail.risk.salvage,
      unclearCustoms: detail.risk.unclearCustoms,
      confiscated: detail.risk.confiscated,
      underCredit: detail.risk.underCredit,
      abroad: detail.risk.abroad,
      description: detail.description,
      mileageK: detail.mileage,
      year: detail.year,
      vinChecked: detail.risk.vinChecked,
      // Assessment-confidence evidence inputs only (spec 006 US6.1); already fetched, no extra call.
      body: detail.body,
      generation: detail.generation,
      cohortTier: benchmark?.cohort.tier,
    });
    const sampleSize = benchmark?.sampleSize ?? 0;
    const benchmarkBase = benchmark?.value.amount ?? 0;
    const mileageAware = benchmark?.mileageAware ?? false;
    const assessment = { detail, result, fairValue, currency, sampleSize, benchmarkBase, mileageAware };
    let listing = await this.findListingByExternalId(externalId);
    if (!listing && this.valuationShadow) {
      // Evidence must be attached to a durable local Listing even for the first pasted URL. This
      // records ordinary listing history only; it does not persist a score or create an opportunity.
      try {
        listing = (await this.listings.recordSeen(detail)).listing;
      } catch (err) {
        // The existing manual assessment remains authoritative for this request; shadow
        // persistence is an optional sidecar and must not make `/check` unavailable.
        this.logger?.warn({ err, externalId }, 'Unable to persist listing for manual shadow evidence');
      }
    }
    if (listing && this.valuationShadow) {
      try {
        await this.valuationShadow.captureManualCheck({
          listing,
          detail,
          legacyReference: {
            baseAmount: benchmarkBase,
            adjustedAmount: fairValue,
            currency,
            sampleSize,
            cohortKey: benchmark?.cohort.key,
            parameterSetVersion: this.valuation.activeParameterVersion(),
          },
        });
      } catch (err) {
        // Manual evidence is a sidecar: its persistence/source failure must not make the existing
        // on-demand assessment unavailable.
        this.logger?.warn({ err, listingId: listing.id }, 'Manual shadow valuation capture failed');
      }
    }
    return assessment;
  }

  /** Prefer the persisted B23 explanation snapshot; fall back to live assessment only when absent. */
  async whyById(externalId: string): Promise<WhyLookup> {
    const listing = await this.findListingByExternalId(externalId);
    if (listing?.lastExplanation) {
      const referencedEvidenceId = isEvaluationExplanationV2(listing.lastExplanation)
        ? listing.lastExplanation.providerEvidence?.evidenceId
        : undefined;
      const evidence =
        this.valuationEvidence && referencedEvidenceId
          ? await this.valuationEvidence.findByIdForListing(referencedEvidenceId, listing.id)
          : null;
      return { stored: listing.lastExplanation, evidence };
    }
    return { live: await this.assessById(externalId) };
  }

  /** The highest-scoring opportunities recorded so far. */
  async topOpportunities(limit = 5): Promise<RankedOpportunity[]> {
    const ops = await this.opportunities
      .createQueryBuilder('o')
      .innerJoin(Listing, 'l', "l.id = o.listingId AND l.status = 'active'")
      .orderBy('o.score', 'DESC')
      .take(limit)
      .getMany();
    const listings = await this.listings.findByIds(ops.map((o) => o.listingId));
    const byId = new Map(listings.map((l) => [l.id, l]));
    return ops.map((opportunity) => ({ opportunity, listing: byId.get(opportunity.listingId) }));
  }

  /** Best-scoring evaluated listings, even below the alert threshold — the "best available now". */
  topCandidates(limit = 5): Promise<Listing[]> {
    return this.listings.topByScore(limit);
  }

  /** Recently evaluated listings (for /history command). */
  async recentEvaluations(limit = 10): Promise<RecentEvaluation[]> {
    const listings = await this.listings.getRecentlyEvaluated(limit);
    return listings.map((l) => ({
      listing: l,
      score: l.lastScore ?? 0,
      discountPct: l.lastDiscountPct ?? 0,
      evaluatedAt: l.lastEvaluatedAt ?? new Date(0),
    }));
  }

  /** Self-tuning report (R1): distribution of scores, near-misses, and a suggested threshold. */
  async report(targetCandidates = 10): Promise<ReportDigest> {
    const scores = await this.listings.scoresForReport();
    const opportunities = await this.opportunities
      .createQueryBuilder('o')
      .innerJoin(Listing, 'l', "l.id = o.listingId AND l.status = 'active'")
      .getCount();
    const nm = await this.listings.nearMisses(Math.max(0, this.minScore - 0.1), this.minScore, 5);
    const nearMisses = nm.map((l) => ({
      label: `${l.make} ${l.model}, ${l.year}`,
      score: l.lastScore ?? 0,
      url: l.url,
    }));
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const labeled = await this.outcomes.manualLabeledSince(since);
    const good = labeled.filter((o) => o.label === 'good').length;
    const bad = labeled.filter((o) => o.label === 'bad').length;
    const precision = realizedPrecision(good, bad);
    const closed = await this.deals.closedDeals();
    const realizedDeals = marginStats(closed);
    return buildDigest(
      scores,
      opportunities,
      nearMisses,
      this.minScore,
      targetCandidates,
      precision,
      realizedDeals,
    );
  }

  budgetReport(): Promise<BudgetReportDigest | null> {
    return this.budget.report();
  }

  /**
   * Read-only accident-clamp rollout report (spec 018 US18.2). Reads persisted explanations and
   * disappearance records only — no source traffic, no budget spend, no state change. It authorizes
   * a **review**, never a flip (FR-007).
   */
  async accidentShadowReport(windowDays = 30): Promise<AccidentShadowDigest> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const listings = await this.listings.accidentShadowEvaluations(since);
    const disappearances = await this.disappearances.findByListingIds(listings.map((l) => l.id));
    const byListing = new Map(disappearances.map((d) => [d.listingId, d]));

    const records: AccidentShadowRecord[] = [];
    for (const listing of listings) {
      const explanation = listing.lastExplanation;
      const verdict = explanation && 'accidentSeverity' in explanation
        ? explanation.accidentSeverity
        : null;
      if (!explanation || !verdict) continue;
      const d = byListing.get(listing.id);
      records.push({
        listingId: listing.id,
        bucket: verdict.bucket,
        reason: verdict.reason,
        corroborated: verdict.corroborated,
        disqualified: explanation.disqualified,
        redFlags: explanation.redFlags,
        raw: explanation.raw,
        confidence: explanation.confidence,
        penalty: explanation.penalty,
        discountPct: explanation.discountPct,
        thresholdUsed: explanation.thresholdUsed,
        factorCount: explanation.factors.length,
        outcome: d
          ? {
              disappeared: true,
              isRelist: d.isRelist,
              domDays: d.domDays ?? null,
              hadPriceCut: d.hadPriceCut,
            }
          : null,
      });
    }
    return buildAccidentShadowDigest(records);
  }

  /** Read-only provider-evidence audit. It never invokes AUTO.RIA or changes live policy. */
  async valuationAudit(): Promise<ValuationAuditDigest | null> {
    if (!this.valuationEvidence) return null;
    const [records, budgetReport] = await Promise.all([
      this.valuationEvidence.findForAudit(),
      this.budget.report('auto-ria'),
    ]);
    return buildValuationAuditDigest(records, {
      ...(budgetReport ? { budget: valuationAiBudgetAudit(budgetReport) } : {}),
    });
  }

  /** Open (bought, unsold) + recently closed deals, each joined to its listing (for /deals). */
  async dealsOverview(
    recentClosed = 10,
  ): Promise<{ open: DealWithListing[]; closed: DealWithListing[] }> {
    const openDeals = await this.deals.openDeals();
    const closedDeals = await this.deals.closedDeals();
    const recent = [...closedDeals]
      .sort((a, b) => (b.soldAt?.getTime() ?? 0) - (a.soldAt?.getTime() ?? 0))
      .slice(0, recentClosed);
    const ids = [...openDeals, ...recent].map((d) => d.listingId);
    const listings = await this.listings.findByIds(ids);
    const byId = new Map(listings.map((l) => [l.id, l]));
    return {
      open: openDeals.map((deal) => ({ deal, listing: byId.get(deal.listingId) })),
      closed: recent.map((deal) => ({ deal, listing: byId.get(deal.listingId) })),
    };
  }

  /** Look up a recorded opportunity by id (for the 👍/👎 outcome buttons). */
  findOpportunity(id: string): Promise<Opportunity | null> {
    return this.opportunities.findOne({ where: { id } });
  }

  /** Look up a listing by its source external id (for the /outcome command). */
  async findListingByExternalId(externalId: string): Promise<Listing | null> {
    const [listing] = await this.listings.findByExternalIds([externalId]);
    return listing ?? null;
  }

  /** Look up a listing by its internal id (for the deal buttons — the reply's copy-ready link). */
  async findListingById(id: string): Promise<Listing | null> {
    const [listing] = await this.listings.findByIds([id]);
    return listing ?? null;
  }

  /** Recently evaluated listings (for /history command). */
  async getRecentEvaluations(limit = 10): Promise<Listing[]> {
    return this.listings.getRecentlyEvaluated(limit);
  }
}

function valuationAiBudgetAudit(report: BudgetReportDigest): ValuationAuditBudget {
  const operation = report.operationActual.find((line) => line.operation === 'valuation_ai');
  return {
    allocation: operation?.allocation ?? null,
    used: operation?.actual ?? 0,
    forecast: operation?.forecast ?? 0,
    deferredCount: report.deferred
      .filter((line) => line.operation === 'valuation_ai')
      .reduce((total, line) => total + line.count, 0),
    poolRemaining: report.poolRemaining,
    reconciliationDifference: report.reconciliationDifference,
  };
}
