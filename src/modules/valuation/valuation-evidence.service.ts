import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Listing } from '../listings/entities/listing.entity';
import {
  ProviderValuationOutcome,
  ProviderValuationRequest,
  ValuationProvider,
  VALUATION_PROVIDER,
} from '../sources/ports/valuation-provider.port';

import {
  assessLegacyDelta,
  assessComparability,
  fingerprintValuationProjection,
  redactValuationProjection,
  snapshotProviderFacts,
  validateAvailableEstimate,
} from './comparability';
import { Opportunity } from './entities/opportunity.entity';
import { ValuationEvidence } from './entities/valuation-evidence.entity';
import { ValuationAuditRecord } from './valuation-audit';
import {
  JsonObject,
  JsonValue,
  LegacyValuationReference,
  ValuationChargeStatus,
  ValuationEvidenceOutcome,
  ValuationEvidenceTerminalOutcome,
  ValuationPolicyDefinition,
} from './valuation-evidence.types';
import { goldCaseForExternalId } from './valuation-gold-cases';
import {
  AI_SHADOW_V1_POLICY,
  decideValuationQueryMode,
  snapshotValuationPolicy,
} from './valuation-policy';

export interface ValuationEvidenceContext {
  /** A local listing is mandatory; the provider's source listing ID stays in the request. */
  listing: Pick<Listing, 'id' | 'externalId'>;
  request: ProviderValuationRequest;
  policy?: ValuationPolicyDefinition;
  opportunityId?: string | null;
  legacyReference?: LegacyValuationReference | null;
  /** Material policy relaxations must be passed explicitly; this service never infers one. */
  materialRelaxations?: readonly string[];
  now?: Date;
}

export interface RecordValuationEvidenceInput extends ValuationEvidenceContext {
  /** Usually the result from ValuationProvider.valuate(); terminal local outcomes are also valid. */
  outcome: ValuationEvidenceOutcome;
}

export interface MaybeCaptureValuationEvidenceInput extends ValuationEvidenceContext {
  /** Tests and manual callers may override the configured provider without changing module wiring. */
  provider?: Pick<ValuationProvider, 'valuate'>;
}

interface PreparedCapture {
  input: ValuationEvidenceContext;
  request: ProviderValuationRequest;
  policy: ValuationPolicyDefinition;
  fingerprint: string;
  preflight?: ValuationEvidenceTerminalOutcome & { reasons: string[] };
}

interface NormalizedOutcome {
  status: ValuationEvidenceOutcome['status'];
  failureCode?: string;
  chargeStatus: ValuationChargeStatus;
  requestProjection: JsonObject;
  sourceCapturedAt?: Date;
  estimate?: { amount: number; currency: string };
  providerStatistics?: JsonObject;
  comparableSummary?: JsonObject;
  providerComparableSummaryAvailable?: boolean;
  providerReturnedComparableCount?: number;
  providerRetainedComparableCount?: number;
  responseFingerprint?: string;
  terminalReasons: string[];
}

/**
 * Persists an append-only, redacted provider-evidence stream.  It neither reads nor alters the
 * legacy fair-value/score path; callers decide when a sidecar lookup is admissible.
 */
@Injectable()
export class ValuationEvidenceService {
  private readonly inFlight = new Map<string, Promise<ValuationEvidence>>();

  constructor(
    @Optional()
    @InjectRepository(ValuationEvidence)
    private readonly evidenceRepo?: Repository<ValuationEvidence>,
    @Optional()
    @InjectRepository(Listing)
    private readonly listingRepo?: Repository<Listing>,
    @Optional()
    @InjectRepository(Opportunity)
    private readonly opportunityRepo?: Repository<Opportunity>,
    @Optional() @Inject(VALUATION_PROVIDER) private readonly provider?: ValuationProvider,
  ) {}

  /**
   * Capture provider evidence only after the caller has independently decided that shadow work
   * is allowed.  It validates before the provider call, reuses fresh evidence, and single-flights
   * concurrent identical requests.  It never falls through to ListingSource.averagePrice().
   */
  async maybeCapture(input: MaybeCaptureValuationEvidenceInput): Promise<ValuationEvidence> {
    const prepared = this.prepare(input);
    if (prepared.preflight) return this.persistPrepared(prepared, prepared.preflight);

    const fresh = await this.findFresh(prepared);
    if (fresh) {
      await this.linkEvidence(fresh, prepared.input);
      return fresh;
    }

    // Evidence rows are immutable and own a local listing identity. Never coalesce attribute-mode
    // requests across listings merely because their normalized vehicle facts happen to match.
    const key = `${prepared.input.listing.id}:${prepared.policy.key}:${prepared.fingerprint}:${legacyReferenceFingerprint(prepared.input.legacyReference)}`;
    const inFlight = this.inFlight.get(key);
    if (inFlight) {
      const shared = await inFlight;
      await this.linkEvidence(shared, prepared.input);
      return shared;
    }

    const run = this.captureWithProvider(prepared, input.provider ?? this.provider).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, run);
    return run;
  }

  /**
   * Persist a terminal outcome already obtained by an adapter.  This is intentionally append-only:
   * retry callers create another record with the same request fingerprint instead of updating one.
   */
  async record(input: RecordValuationEvidenceInput): Promise<ValuationEvidence> {
    const prepared = this.prepare(input);
    return this.persistPrepared(prepared, prepared.preflight ?? input.outcome);
  }

  /** Read-only lookup used by stored explanations and audits; no provider request is made. */
  async findLatestForListing(listingId: string): Promise<ValuationEvidence | null> {
    return this.requireEvidenceRepo().findOne({
      where: { listingId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Read exactly the provider record referenced by an immutable V2 explanation, never a newer one. */
  async findByIdForListing(evidenceId: string, listingId: string): Promise<ValuationEvidence | null> {
    return this.requireEvidenceRepo().findOne({ where: { id: evidenceId, listingId } });
  }

  /** Link a reused in-flight/fresh record to this caller's convenience projections only. */
  async linkExisting(
    evidence: ValuationEvidence,
    input: Pick<ValuationEvidenceContext, 'listing' | 'opportunityId'>,
  ): Promise<void> {
    await this.linkEvidence(evidence, input);
  }

  /** Read-only audit input; higher layers decide authorization and formatting. */
  async findForAudit(): Promise<ValuationAuditRecord[]> {
    const records = await this.requireEvidenceRepo().find({ order: { createdAt: 'ASC' } });
    if (!this.listingRepo || records.length === 0) return records;
    const listingIds = [...new Set(records.map((record) => record.listingId))];
    const listings = await this.listingRepo.find({ where: { id: In(listingIds) } });
    const externalIdByListingId = new Map(listings.map((listing) => [listing.id, listing.externalId]));
    return records.map((record) => {
      const externalId = externalIdByListingId.get(record.listingId);
      const goldCase = externalId ? goldCaseForExternalId(externalId) : undefined;
      return {
        status: record.status,
        comparability: record.comparability,
        queryMode: record.queryMode,
        failureCode: record.failureCode,
        comparabilityReasons: record.comparabilityReasons,
        chargeStatus: record.chargeStatus,
        selectionReason: record.selectionReason,
        trigger: record.trigger,
        providerKey: record.providerKey,
        requestFingerprint: record.requestFingerprint,
        estimateAmount: record.estimateAmount,
        currency: record.currency,
        legacyReference: record.legacyReference,
        ...(goldCase ? { goldCaseKey: goldCase.key, strata: goldCase.strata } : {}),
      };
    });
  }

  private async captureWithProvider(
    prepared: PreparedCapture,
    provider: Pick<ValuationProvider, 'valuate'> | undefined,
  ): Promise<ValuationEvidence> {
    if (!provider) {
      return this.persistPrepared(prepared, {
        status: 'not_configured',
        failureCode: 'not_configured',
        chargeStatus: 'not_applicable',
      });
    }

    try {
      const outcome = await provider.valuate(prepared.request);
      return this.persistPrepared(prepared, outcome);
    } catch {
      // A transport exception becomes visible, auditable evidence.  The legacy path is untouched.
      return this.persistPrepared(prepared, {
        status: 'unavailable',
        failureCode: 'transport',
        chargeStatus: 'unknown',
      });
    }
  }

  private prepare(input: ValuationEvidenceContext): PreparedCapture {
    const policy = input.policy ?? AI_SHADOW_V1_POLICY;
    const computedFingerprint = canonicalRequestFingerprint(input.request);
    const request = {
      ...input.request,
      requestFingerprint: isSha256(input.request.requestFingerprint)
        ? input.request.requestFingerprint
        : computedFingerprint,
    };
    const reasons: string[] = [];

    if (request.target !== policy.target) reasons.push('policy_target_mismatch');
    if (request.policyKey !== policy.key) reasons.push('policy_key_mismatch');
    if (policy.status !== 'shadow') reasons.push('policy_not_shadow');

    const mode = decideValuationQueryMode({
      omniId: request.sourceListingId,
      facts: request.normalizedFacts,
      policy,
      requestedMode: request.queryMode,
    });
    if (!mode.queryMode || mode.queryMode !== request.queryMode) reasons.push(...mode.reasons);

    return {
      input,
      request,
      policy,
      fingerprint: request.requestFingerprint,
      preflight:
        reasons.length > 0
          ? {
              status: 'invalid_input',
              failureCode: 'invalid_input',
              chargeStatus: 'not_applicable',
              reasons: uniqueSorted(reasons),
            }
          : undefined,
    };
  }

  private async findFresh(prepared: PreparedCapture): Promise<ValuationEvidence | null> {
    const previous = await this.requireEvidenceRepo().findOne({
      where: {
        listingId: prepared.input.listing.id,
        requestFingerprint: prepared.fingerprint,
        policyKey: prepared.policy.key,
        status: 'available',
      },
      order: { createdAt: 'DESC' },
    });
    if (!previous?.expiresAt) return null;
    if (!sameLegacyReference(previous.legacyReference, prepared.input.legacyReference)) return null;
    return previous.expiresAt.getTime() >= (prepared.input.now ?? new Date()).getTime() ? previous : null;
  }

  private async persistPrepared(
    prepared: PreparedCapture,
    sourceOutcome: ValuationEvidenceOutcome,
  ): Promise<ValuationEvidence> {
    const outcome = normalizeOutcome(prepared.request, sourceOutcome);
    const legacy = withLegacyDelta(prepared.input.legacyReference, outcome.estimate);
    const assessment = assessComparability({
      status: outcome.status,
      queryMode: prepared.request.queryMode,
      facts: prepared.request.normalizedFacts,
      policy: prepared.policy,
      materialRelaxations: prepared.input.materialRelaxations,
      sourceCapturedAt: outcome.sourceCapturedAt ?? null,
      providerStatisticsAvailable: outcome.providerStatistics !== undefined,
      providerComparableSummaryAvailable: outcome.providerComparableSummaryAvailable,
      providerReturnedComparableCount: outcome.providerReturnedComparableCount,
      providerRetainedComparableCount: outcome.providerRetainedComparableCount,
      legacyDeltaPct: legacy.reference?.providerDeltaPct ?? null,
      terminalReasons: legacy.reason
        ? [...outcome.terminalReasons, legacy.reason]
        : outcome.terminalReasons,
      now: prepared.input.now,
    });
    const expiresAt = expiryFor(outcome.sourceCapturedAt, prepared.policy.rules.freshnessHours);
    const entity = this.requireEvidenceRepo().create({
      listingId: prepared.input.listing.id,
      profileId: prepared.request.context.profileId ?? null,
      opportunityId: prepared.input.opportunityId ?? null,
      providerKey: prepared.request.providerKey,
      target: prepared.request.target,
      trigger: prepared.request.context.trigger,
      selectionReason: prepared.request.context.selectionReason,
      policyKey: prepared.policy.key,
      policySnapshot: snapshotValuationPolicy(prepared.policy),
      adapterVersion: prepared.request.adapterVersion,
      queryMode: prepared.request.queryMode,
      requestFingerprint: prepared.fingerprint,
      inputSnapshot: snapshotProviderFacts(prepared.request.normalizedFacts),
      requestProjection: outcome.requestProjection,
      status: outcome.status,
      failureCode: outcome.failureCode ?? null,
      comparability: assessment.comparability,
      comparabilityReasons: assessment.reasons,
      inputCompleteness: assessment.inputCompleteness,
      estimateAmount: outcome.estimate?.amount ?? null,
      currency: outcome.estimate?.currency ?? null,
      providerStatistics: outcome.providerStatistics ?? null,
      comparableSummary: outcome.comparableSummary ?? null,
      legacyReference: legacy.reference,
      sourceCapturedAt: outcome.sourceCapturedAt ?? null,
      expiresAt,
      responseFingerprint: outcome.responseFingerprint ?? null,
      chargeStatus: outcome.chargeStatus,
    });
    const saved = await this.requireEvidenceRepo().save(entity);
    await this.linkEvidence(saved, prepared.input);
    return saved;
  }

  /** Projections point at a durable evidence row only after its terminal record was saved. */
  private async linkEvidence(
    evidence: ValuationEvidence,
    input: Pick<ValuationEvidenceContext, 'listing' | 'opportunityId'>,
  ): Promise<void> {
    const writes: Array<Promise<unknown>> = [];
    if (this.listingRepo) {
      writes.push(
        this.listingRepo.update({ id: input.listing.id }, { lastValuationEvidenceId: evidence.id }),
      );
    }
    if (input.opportunityId && this.opportunityRepo) {
      writes.push(
        this.opportunityRepo.update(
          { id: input.opportunityId },
          { valuationEvidenceId: evidence.id },
        ),
      );
    }
    await Promise.all(writes);
  }

  private requireEvidenceRepo(): Repository<ValuationEvidence> {
    if (!this.evidenceRepo) throw new Error('ValuationEvidence repository is not configured');
    return this.evidenceRepo;
  }
}

/** Shared canonical fingerprint input; all fields have already been chosen before source admission. */
export function canonicalRequestFingerprint(request: ProviderValuationRequest): string {
  return fingerprintValuationProjection({
    providerKey: request.providerKey,
    target: request.target,
    policyKey: request.policyKey,
    adapterVersion: request.adapterVersion,
    period: request.period,
    languageId: request.languageId,
    queryMode: request.queryMode,
    sourceListingId: request.sourceListingId,
    normalizedFacts: request.normalizedFacts,
  });
}

/**
 * Fresh provider output can be reused only for the same frozen legacy context. Otherwise its
 * persisted provider-to-legacy delta would be attached to a newer evaluation and become false.
 */
export function legacyReferenceFingerprint(
  reference: LegacyValuationReference | null | undefined,
): string {
  return fingerprintValuationProjection({
    baseAmount: reference?.baseAmount ?? null,
    adjustedAmount: reference?.adjustedAmount ?? null,
    currency: reference?.currency?.trim().toUpperCase() ?? null,
    sampleSize: reference?.sampleSize ?? null,
    cohortKey: reference?.cohortKey ?? null,
    parameterSetVersion: reference?.parameterSetVersion ?? null,
  });
}

export function sameLegacyReference(
  left: LegacyValuationReference | null | undefined,
  right: LegacyValuationReference | null | undefined,
): boolean {
  return legacyReferenceFingerprint(left) === legacyReferenceFingerprint(right);
}

function normalizeOutcome(
  request: ProviderValuationRequest,
  source: ValuationEvidenceOutcome,
): NormalizedOutcome {
  if (!isProviderOutcome(source)) {
    return {
      status: source.status,
      failureCode: source.failureCode,
      chargeStatus: source.chargeStatus ?? 'not_applicable',
      requestProjection: fallbackRequestProjection(request),
      terminalReasons: source.failureCode ? [source.failureCode] : [],
    };
  }

  const requestProjection = jsonObject(source.requestProjection);
  const matchingContract =
    source.providerKey === request.providerKey &&
    source.target === request.target &&
    source.adapterVersion === request.adapterVersion &&
    source.queryMode === request.queryMode;
  if (!matchingContract) {
    return {
      status: 'unavailable',
      failureCode: 'provider_contract_mismatch',
      chargeStatus: source.chargeStatus,
      requestProjection,
      sourceCapturedAt: source.sourceCapturedAt,
      terminalReasons: ['provider_contract_mismatch'],
    };
  }

  const invalidEstimate = source.status === 'available' ? validateAvailableEstimate(source.estimate) : [];
  if (invalidEstimate.length > 0) {
    return {
      status: 'unavailable',
      failureCode: 'schema_invalid',
      chargeStatus: source.chargeStatus,
      requestProjection,
      sourceCapturedAt: source.sourceCapturedAt,
      providerStatistics: source.statistics ? jsonObject(source.statistics) : undefined,
      comparableSummary: source.comparableSummary ? jsonObject(source.comparableSummary) : undefined,
      providerComparableSummaryAvailable: source.comparableSummary !== undefined,
      providerReturnedComparableCount: source.comparableSummary?.returnedCount,
      providerRetainedComparableCount: source.comparableSummary?.retainedCount,
      responseFingerprint: source.responseFingerprint,
      terminalReasons: ['schema_invalid', ...invalidEstimate],
    };
  }

  return {
    status: source.status,
    failureCode: source.failureCode,
    chargeStatus: source.chargeStatus,
    requestProjection,
    sourceCapturedAt: source.sourceCapturedAt,
    estimate: source.estimate,
    providerStatistics: source.statistics ? jsonObject(source.statistics) : undefined,
    comparableSummary: source.comparableSummary ? jsonObject(source.comparableSummary) : undefined,
    providerComparableSummaryAvailable: source.comparableSummary !== undefined,
    providerReturnedComparableCount: source.comparableSummary?.returnedCount,
    providerRetainedComparableCount: source.comparableSummary?.retainedCount,
    responseFingerprint:
      source.responseFingerprint ??
      fingerprintValuationProjection({
        status: source.status,
        estimate: source.estimate,
        statistics: source.statistics,
        comparableSummary: source.comparableSummary,
        sourceCapturedAt: source.sourceCapturedAt,
      }),
    terminalReasons: source.failureCode ? [source.failureCode] : [],
  };
}

function isProviderOutcome(value: ValuationEvidenceOutcome): value is ProviderValuationOutcome {
  return 'providerKey' in value;
}

function withLegacyDelta(
  reference: LegacyValuationReference | null | undefined,
  providerEstimate: { amount: number; currency: string } | undefined,
): { reference: LegacyValuationReference | null; reason?: string } {
  if (!reference) return { reference: null };
  const sanitized = jsonObject(reference) as LegacyValuationReference;
  // Never inherit a caller's stale delta: it may have been calculated in a different currency.
  delete sanitized.providerDeltaAmount;
  delete sanitized.providerDeltaPct;
  const delta = assessLegacyDelta(providerEstimate, sanitized);
  if (delta.delta) {
    sanitized.providerDeltaAmount = delta.delta.amount;
    sanitized.providerDeltaPct = delta.delta.pct;
  }
  return { reference: sanitized, ...(delta.reason ? { reason: delta.reason } : {}) };
}

function expiryFor(sourceCapturedAt: Date | undefined, freshnessHours: number): Date | null {
  if (!sourceCapturedAt || !Number.isFinite(sourceCapturedAt.getTime()) || !Number.isFinite(freshnessHours)) {
    return null;
  }
  return new Date(sourceCapturedAt.getTime() + freshnessHours * 60 * 60 * 1000);
}

function fallbackRequestProjection(request: ProviderValuationRequest): JsonObject {
  return jsonObject({
    providerKey: request.providerKey,
    target: request.target,
    policyKey: request.policyKey,
    adapterVersion: request.adapterVersion,
    period: request.period,
    languageId: request.languageId,
    queryMode: request.queryMode,
    sourceListingId: request.sourceListingId,
    requestFingerprint: request.requestFingerprint,
  });
}

function jsonObject(value: unknown): JsonObject {
  const redacted = redactValuationProjection(value);
  if (typeof redacted === 'object' && redacted !== null && !Array.isArray(redacted)) return redacted;
  return { value: redacted as JsonValue };
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
