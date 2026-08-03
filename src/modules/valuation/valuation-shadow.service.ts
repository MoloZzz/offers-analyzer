import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AppConfig } from '../../common/config/configuration';
import { Listing } from '../listings/entities/listing.entity';
import { ListingsService } from '../listings/listings.service';
import { RateBudgetService } from '../scheduling/rate-budget.service';
import { ListingDetail, toProviderVehicleFacts } from '../sources/ports/listing-source.port';
import {
  AUTO_RIA_AI_PROVIDER_KEY,
  ProviderValuationRequest,
  ValuationProvider,
  VALUATION_PROVIDER,
} from '../sources/ports/valuation-provider.port';

import { ValuationEvidence } from './entities/valuation-evidence.entity';
import {
  canonicalRequestFingerprint,
  legacyReferenceFingerprint,
  sameLegacyReference,
  ValuationEvidenceService,
} from './valuation-evidence.service';
import { LegacyValuationReference } from './valuation-evidence.types';
import {
  AI_SHADOW_V1_POLICY,
  decideValuationQueryMode,
  selectDeterministicShadowSample,
} from './valuation-policy';

const SOURCE_KEY = 'auto-ria';
const SHADOW_PRIORITY_TIER = 5;
const AI_PERIOD = 168;
const AI_LANGUAGE_ID = 4;
const MAX_PROVIDER_ATTEMPTS = 2;

export interface ValuationShadowInput {
  listing: Listing;
  detail: ListingDetail;
  profileId?: string;
  opportunityId?: string | null;
  legacyReference?: LegacyValuationReference | null;
}

/**
 * The only coordinator allowed to invoke the paid valuation provider. It is deliberately a
 * sidecar: legacy valuation completes before this runs, and any failure is stored as evidence
 * rather than changing score, rank, opportunity eligibility, or notification delivery.
 */
@Injectable()
export class ValuationShadowService {
  private readonly inFlight = new Map<string, Promise<ValuationEvidence>>();

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly budget: RateBudgetService,
    private readonly evidence: ValuationEvidenceService,
    private readonly listings: ListingsService,
    @Inject(VALUATION_PROVIDER) private readonly provider: ValuationProvider,
    @InjectPinoLogger(ValuationShadowService.name) private readonly logger: PinoLogger,
  ) {}

  /** Deterministically collect a low-priority shadow sample only when it has been configured. */
  async capturePollShadow(input: ValuationShadowInput): Promise<ValuationEvidence | null> {
    const sampleRate = this.config.get('autoRiaAiSampleRate', { infer: true });
    if (
      sampleRate <= 0 ||
      !selectDeterministicShadowSample(input.listing.externalId, AI_SHADOW_V1_POLICY.key, sampleRate)
    ) {
      return null;
    }
    return this.capture(input, 'poll_shadow', 'deterministic_sample');
  }

  /** Explicit operator check. Disabled configuration is recorded locally as not_configured. */
  async captureManualCheck(input: ValuationShadowInput): Promise<ValuationEvidence | null> {
    return this.capture(input, 'manual_check', 'manual');
  }

  private async capture(
    input: ValuationShadowInput,
    trigger: 'poll_shadow' | 'manual_check',
    selectionReason: 'deterministic_sample' | 'manual',
  ): Promise<ValuationEvidence | null> {
    // Freeze the legacy-evaluation identity before any asynchronous source/budget work starts.
    // Manual checks deliberately have no such attachment target.
    const expectedEvaluationAt =
      trigger === 'poll_shadow' && input.listing.lastEvaluatedAt
        ? new Date(input.listing.lastEvaluatedAt)
        : null;
    const request = this.buildRequest(input, trigger, selectionReason);
    const existing = await this.findFresh(request, input.listing.id, input.legacyReference);
    if (existing) {
      await this.evidence.linkExisting(existing, {
        listing: input.listing,
        opportunityId: input.opportunityId,
      });
      await this.attachProjection(input.listing.id, existing, expectedEvaluationAt);
      return existing;
    }

    const inFlightKey = `${input.listing.id}:${request.requestFingerprint}:${legacyReferenceFingerprint(input.legacyReference)}`;
    const inFlight = this.inFlight.get(inFlightKey);
    if (inFlight) {
      const shared = await inFlight;
      await this.evidence.linkExisting(shared, {
        listing: input.listing,
        opportunityId: input.opportunityId,
      });
      await this.attachProjection(input.listing.id, shared, expectedEvaluationAt);
      return shared;
    }

    const run = this.captureNew(input, request, expectedEvaluationAt).finally(() => {
      this.inFlight.delete(inFlightKey);
    });
    this.inFlight.set(inFlightKey, run);
    return run;
  }

  private buildRequest(
    input: ValuationShadowInput,
    trigger: 'poll_shadow' | 'manual_check',
    selectionReason: 'deterministic_sample' | 'manual',
  ): ProviderValuationRequest {
    const facts = toProviderVehicleFacts(input.detail);
    const sourceListingId = /^\d+$/.test(input.listing.externalId)
      ? input.listing.externalId
      : undefined;
    const mode = decideValuationQueryMode({
      omniId: sourceListingId,
      facts,
      policy: AI_SHADOW_V1_POLICY,
    });
    const request: ProviderValuationRequest = {
      providerKey: AUTO_RIA_AI_PROVIDER_KEY,
      target: AI_SHADOW_V1_POLICY.target,
      policyKey: this.config.get('autoRiaAiPolicyKey', { infer: true }),
      adapterVersion: this.provider.adapterVersion,
      period: AI_PERIOD,
      languageId: AI_LANGUAGE_ID,
      queryMode: mode.queryMode ?? 'attributes',
      ...(mode.queryMode === 'omni_id' && sourceListingId ? { sourceListingId } : {}),
      normalizedFacts: facts,
      requestFingerprint: '',
      context: { trigger, selectionReason, profileId: input.profileId },
    };
    request.requestFingerprint = canonicalRequestFingerprint(request);
    return request;
  }

  private async captureNew(
    input: ValuationShadowInput,
    request: ProviderValuationRequest,
    expectedEvaluationAt: Date | null,
  ): Promise<ValuationEvidence> {
    // A policy key is controlled configuration, but this release contains one immutable policy.
    // Record bad configuration instead of silently selecting or inventing a different policy.
    if (request.policyKey !== AI_SHADOW_V1_POLICY.key) {
      return this.persistTerminal(
        input,
        request,
        expectedEvaluationAt,
        'invalid_input',
        'invalid_input',
        'not_applicable',
      );
    }

    const mode = decideValuationQueryMode({
      omniId: request.sourceListingId,
      facts: request.normalizedFacts,
      policy: AI_SHADOW_V1_POLICY,
      requestedMode: request.queryMode,
    });
    if (!mode.queryMode || mode.queryMode !== request.queryMode) {
      return this.persistTerminal(
        input,
        request,
        expectedEvaluationAt,
        'invalid_input',
        'invalid_input',
        'not_applicable',
      );
    }

    if (!this.isProviderConfigured()) {
      return this.persistTerminal(
        input,
        request,
        expectedEvaluationAt,
        'not_configured',
        'not_configured',
        'not_applicable',
      );
    }

    let last: ValuationEvidence | undefined;
    for (let attempt = 0; attempt < MAX_PROVIDER_ATTEMPTS; attempt += 1) {
      const allowed = await this.budget.tryConsume(SOURCE_KEY, 1, SHADOW_PRIORITY_TIER, {
        operation: 'valuation_ai',
        profileId: input.profileId,
        requestFingerprint: request.requestFingerprint,
        chargeStatus: 'unknown',
        operationMonthlyAllocation: this.config.get('autoRiaAiMonthlyAllocation', { infer: true }),
      });
      if (!allowed) {
        return this.persistTerminal(
          input,
          request,
          expectedEvaluationAt,
          'deferred',
          'budget_denied',
          'not_charged',
        );
      }

      last = await this.evidence.maybeCapture({
        listing: input.listing,
        request,
        policy: AI_SHADOW_V1_POLICY,
        opportunityId: input.opportunityId,
        legacyReference: input.legacyReference,
      });
      await this.attachProjection(input.listing.id, last, expectedEvaluationAt);

      if (last.failureCode === 'source_rate_limited') {
        await this.budget.markExhausted(SOURCE_KEY);
        return last;
      }
      if (!isRetryable(last) || attempt + 1 >= MAX_PROVIDER_ATTEMPTS) return last;
      await delay(100 * (attempt + 1));
    }
    return last as ValuationEvidence;
  }

  private async persistTerminal(
    input: ValuationShadowInput,
    request: ProviderValuationRequest,
    expectedEvaluationAt: Date | null,
    status: 'not_configured' | 'invalid_input' | 'deferred',
    failureCode: 'not_configured' | 'invalid_input' | 'budget_denied',
    chargeStatus: 'not_applicable' | 'not_charged',
  ): Promise<ValuationEvidence> {
    const evidence = await this.evidence.record({
      listing: input.listing,
      request,
      policy: AI_SHADOW_V1_POLICY,
      opportunityId: input.opportunityId,
      legacyReference: input.legacyReference,
      outcome: { status, failureCode, chargeStatus },
    });
    await this.attachProjection(input.listing.id, evidence, expectedEvaluationAt);
    return evidence;
  }

  private async findFresh(
    request: ProviderValuationRequest,
    listingId: string,
    legacyReference: LegacyValuationReference | null | undefined,
  ): Promise<ValuationEvidence | null> {
    const latest = await this.evidence.findLatestForListing(listingId);
    if (
      latest?.status === 'available' &&
      latest.policyKey === request.policyKey &&
      latest.requestFingerprint === request.requestFingerprint &&
      sameLegacyReference(latest.legacyReference, legacyReference) &&
      latest.expiresAt != null &&
      latest.expiresAt.getTime() >= Date.now()
    ) {
      return latest;
    }
    return null;
  }

  private isProviderConfigured(): boolean {
    return (
      this.config.get('autoRiaAiEnabled', { infer: true }) &&
      this.config.get('autoRiaAiApiKey', { infer: true }).trim() !== '' &&
      this.config.get('autoRiaAiUserId', { infer: true }).trim() !== ''
    );
  }

  private async attachProjection(
    listingId: string,
    evidence: ValuationEvidence,
    expectedEvaluationAt: Date | null,
  ): Promise<void> {
    try {
      await this.listings.recordValuationEvidenceProjection(listingId, evidence, expectedEvaluationAt);
    } catch (error) {
      // The immutable record was already stored. A convenience-projection failure must never
      // affect a score or hide the evidence from an audit query.
      this.logger.warn(
        { err: error, listingId, evidenceId: evidence.id },
        'Unable to update valuation evidence projection',
      );
    }
  }
}

function isRetryable(evidence: ValuationEvidence): boolean {
  return (
    evidence.status === 'unavailable' &&
    (evidence.failureCode === 'timeout' ||
      evidence.failureCode === 'transport' ||
      evidence.failureCode === 'source_5xx')
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
