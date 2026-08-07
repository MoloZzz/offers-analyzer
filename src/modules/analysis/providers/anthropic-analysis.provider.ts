import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { request } from 'undici';

import { AppConfig } from '../../../common/config/configuration';
import { AnalysisPolicy } from '../analysis-policy';
import { AnalysisTerminalReason } from '../analysis.types';
import {
  AnalysisProvider,
  AnalysisProviderOutcome,
  AnalysisProviderRequest,
} from '../ports/analysis-provider.port';

export const ANTHROPIC_ANALYSIS_PROVIDER_KEY = 'anthropic';
export const ANTHROPIC_ANALYSIS_ADAPTER_VERSION = 'anthropic-analysis-v1';
export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const TOOL_NAME = 'submit_analysis';

/**
 * SPEC-017 T019 — first adapter behind `AnalysisProvider`.
 *
 * Two deliberate choices:
 *
 * - **Structured output through a forced tool call**, not free-text JSON. `tool_choice` pins the
 *   model to one schema-shaped answer, so a malformed reply is a rare failure rather than the
 *   routine parsing problem it is with prose. It does *not* replace validation: the payload still
 *   goes through `analysis-output.ts` untouched (FR-004).
 * - **No SDK dependency.** One `undici` POST, exactly like the AUTO.RIA adapter, keeps the port's
 *   only vendor coupling inside this file and adds nothing to the dependency surface.
 *
 * With the default configuration `isConfigured()` is false and no request is ever constructed.
 */
@Injectable()
export class AnthropicAnalysisProvider implements AnalysisProvider {
  readonly key = ANTHROPIC_ANALYSIS_PROVIDER_KEY;
  readonly adapterVersion = ANTHROPIC_ANALYSIS_ADAPTER_VERSION;
  readonly modelId: string;
  private readonly enabled: boolean;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(
    config: ConfigService<AppConfig, true>,
    @InjectPinoLogger(AnthropicAnalysisProvider.name) private readonly logger: PinoLogger,
  ) {
    this.enabled = config.get('aiAnalysisEnabled', { infer: true });
    this.apiKey = config.get('aiAnalysisApiKey', { infer: true });
    this.modelId = config.get('aiAnalysisModelId', { infer: true });
    this.timeoutMs = config.get('aiAnalysisTimeoutMs', { infer: true });
  }

  isConfigured(): boolean {
    return this.enabled && this.apiKey.trim() !== '' && this.modelId.trim() !== '';
  }

  async analyze(input: AnalysisProviderRequest): Promise<AnalysisProviderOutcome> {
    const samplingParams = this.samplingParams(input.policy);
    if (!this.isConfigured()) return this.failure('not_configured', samplingParams, false);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const { statusCode, body } = await request(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: this.modelId,
          max_tokens: input.policy.sampling.maxOutputTokens,
          temperature: input.policy.sampling.temperature,
          system: input.context.instructions,
          messages: [{ role: 'user', content: input.context.userContent }],
          tools: [analysisTool(input.policy)],
          tool_choice: { type: 'tool', name: TOOL_NAME },
        }),
        signal: controller.signal,
      });

      const httpFailure = mapHttpFailure(statusCode);
      if (httpFailure) {
        return this.failure(httpFailure.reason, samplingParams, httpFailure.possiblyCharged);
      }

      let payload: unknown;
      try {
        payload = await body.json();
      } catch {
        // A 200 that will not parse was still generated, and therefore probably billed.
        return this.failure('schema_invalid', samplingParams, true);
      }

      const toolInput = extractToolInput(payload);
      if (toolInput === undefined) return this.failure('schema_invalid', samplingParams, true);

      return { status: 'available', payload: toolInput, modelId: this.modelId, samplingParams };
    } catch (error: unknown) {
      const reason: AnalysisTerminalReason =
        controller.signal.aborted || isAbortError(error) ? 'timeout' : 'transport';
      this.logger.warn({ reason }, 'AI analysis provider request failed');
      // A timeout is ours, not the provider's: the completion may well have been produced and
      // billed on their side, so the ledger must not claim otherwise.
      return this.failure(reason, samplingParams, reason === 'timeout');
    } finally {
      clearTimeout(timeout);
    }
  }

  private samplingParams(policy: AnalysisPolicy): Record<string, unknown> {
    return {
      model: this.modelId,
      temperature: policy.sampling.temperature,
      max_tokens: policy.sampling.maxOutputTokens,
      tool_choice: TOOL_NAME,
      anthropic_version: ANTHROPIC_VERSION,
      adapter_version: this.adapterVersion,
    };
  }

  private failure(
    reason: AnalysisTerminalReason,
    samplingParams: Record<string, unknown>,
    possiblyCharged: boolean,
  ): AnalysisProviderOutcome {
    return { status: 'unavailable', reason, modelId: this.modelId, samplingParams, possiblyCharged };
  }
}

/** The output contract, expressed as the tool the model must answer through. */
function analysisTool(policy: AnalysisPolicy): Record<string, unknown> {
  const { ranges } = policy;
  return {
    name: TOOL_NAME,
    description:
      'Submit the advisory analysis. Warnings, checklist and questions come first; the advisory ' +
      'score is a subordinate opinion and changes no automated decision.',
    input_schema: {
      type: 'object',
      properties: {
        warnings: {
          type: 'array',
          maxItems: ranges.maxWarnings,
          items: {
            type: 'object',
            properties: {
              code: { type: 'string', maxLength: ranges.maxTextLength },
              severity: { type: 'string', enum: ['low', 'medium', 'high'] },
              rationale: { type: 'string', maxLength: ranges.maxTextLength },
              estimatedCostUsd: { type: 'number', minimum: 0, maximum: ranges.maxEstimatedCostUsd },
            },
            required: ['code', 'severity', 'rationale'],
          },
        },
        inspectionChecklist: {
          type: 'array',
          maxItems: ranges.maxChecklistItems,
          items: { type: 'string', maxLength: ranges.maxTextLength },
        },
        sellerQuestions: {
          type: 'array',
          maxItems: ranges.maxSellerQuestions,
          items: { type: 'string', maxLength: ranges.maxTextLength },
        },
        advisoryScore: {
          type: 'number',
          minimum: ranges.advisoryScoreMin,
          maximum: ranges.advisoryScoreMax,
        },
        advisoryScoreRationale: { type: 'string', maxLength: ranges.maxTextLength },
        reliabilityNotes: {
          type: 'array',
          maxItems: ranges.maxReliabilityNotes,
          items: { type: 'string', maxLength: ranges.maxTextLength },
        },
      },
      required: [
        'warnings',
        'inspectionChecklist',
        'sellerQuestions',
        'advisoryScore',
        'advisoryScoreRationale',
      ],
    },
  };
}

/**
 * Pull the tool input out of a Messages response. A `max_tokens` stop is treated as no answer at
 * all: the tool input would be truncated, and a truncated structured answer is precisely the
 * "partial value" FR-004 forbids.
 */
function extractToolInput(payload: unknown): unknown {
  if (!isRecord(payload) || !Array.isArray(payload.content)) return undefined;
  if (payload.stop_reason === 'max_tokens') return undefined;
  for (const block of payload.content) {
    if (isRecord(block) && block.type === 'tool_use' && block.name === TOOL_NAME) {
      return block.input;
    }
  }
  return undefined;
}

function mapHttpFailure(
  statusCode: number,
): { reason: AnalysisTerminalReason; possiblyCharged: boolean } | undefined {
  if (statusCode >= 200 && statusCode < 300) return undefined;
  if (statusCode === 401 || statusCode === 403)
    return { reason: 'auth_failed', possiblyCharged: false };
  if (statusCode === 429) return { reason: 'provider_rate_limited', possiblyCharged: false };
  if (statusCode >= 500) return { reason: 'provider_5xx', possiblyCharged: true };
  return { reason: 'provider_4xx', possiblyCharged: false };
}

function isAbortError(error: unknown): boolean {
  if (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.name === 'RequestAbortedError' ||
      error.message.toLowerCase().includes('aborted'))
  ) {
    return true;
  }
  return isRecord(error) && error.code === 'UND_ERR_ABORTED';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
