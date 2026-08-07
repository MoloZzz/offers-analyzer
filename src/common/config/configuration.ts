/**
 * Typed application configuration, loaded from environment (constitution §V: no secrets in code).
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  autoRiaApiKey: string;
  /** SPEC-015: paid provider remains inert unless explicitly enabled with approved credentials. */
  autoRiaAiEnabled: boolean;
  autoRiaAiApiKey: string;
  autoRiaAiUserId: string;
  autoRiaAiPolicyKey: string;
  /** Fraction in [0, 1]; default zero prevents automatic shadow traffic. */
  autoRiaAiSampleRate: number;
  /** Dedicated monthly allocation inside the shared AUTO.RIA pool; default zero. */
  autoRiaAiMonthlyAllocation: number;
  /** Bounded per-request source timeout for the AI adapter. */
  autoRiaAiTimeoutMs: number;
  /** SPEC-017: admin-only advisory AI analysis. Disabled by default; a zero cap also disables it. */
  aiAnalysisEnabled: boolean;
  aiAnalysisApiKey: string;
  aiAnalysisModelId: string;
  /** Dedicated monthly cap, in requests. Never drawn from the AUTO.RIA pool (FR-006). */
  aiAnalysisMonthlyAllocation: number;
  /** Per-admin admissions allowed inside the rolling window below. */
  aiAnalysisPerAdminLimit: number;
  aiAnalysisPerAdminWindowHours: number;
  aiAnalysisTimeoutMs: number;
  telegramBotToken: string;
  telegramAdminChatIds: string[];
  nbuRateUrl: string;
  rateBudgetPerHour: number;
  /** ADR-0009: monthly pool for flexible rate limiting (default 20,000). */
  rateBudgetPoolPerMonth: number;
  /** ADR-0009: reserve % held back from daily allocation (default 15%). */
  rateBudgetReservePct: number;
  /** ADR-0009: threshold % of daily budget for tier cutoff (default 10%). */
  rateBudgetCutoffThresholdPct: number;
  defaultMinDealScore: number;
  defaultConfidenceMinSamples: number;
  /** Analytic mileage correction (M2): applied only when the matched cohort was not mileage-banded. */
  mileageAnnualK: number;
  mileagePer10kPct: number;
  mileageMaxAdjPct: number;
  /** When true, log every outbound request + raw response to external sources (api_key redacted). */
  logSourceRequests: boolean;
  /** pino log level: trace|debug|info|warn|error|fatal. */
  logLevel: string;
  /** 'propose' (default): calibration only records proposals. 'auto': bounded auto-apply. */
  calibrationMode: 'propose' | 'auto';
  /** Desired min # of qualifying listings (scores >= threshold) — calibration target. */
  calibrationMinVolume: number;
  /** Desired max # of qualifying listings (scores >= threshold) — calibration target. */
  calibrationMaxVolume: number;
  /** Desired floor on realized precision (0..1) — calibration target. */
  calibrationMinPrecision: number;
  /** Days a bought-but-unsold deal may sit before the operator is nudged to close it (SPEC-007). */
  dealReminderDays: number;
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  autoRiaApiKey: process.env.AUTO_RIA_API_KEY ?? '',
  autoRiaAiEnabled: process.env.AUTO_RIA_AI_ENABLED === 'true',
  autoRiaAiApiKey: process.env.AUTO_RIA_AI_API_KEY ?? '',
  autoRiaAiUserId: process.env.AUTO_RIA_AI_USER_ID ?? '',
  autoRiaAiPolicyKey: process.env.AUTO_RIA_AI_POLICY_KEY?.trim() || 'ai-shadow-v1',
  autoRiaAiSampleRate: boundedNumber(process.env.AUTO_RIA_AI_SAMPLE_RATE, 0, 0, 1),
  autoRiaAiMonthlyAllocation: boundedInteger(
    process.env.AUTO_RIA_AI_MONTHLY_ALLOCATION,
    0,
    0,
    1_000_000,
  ),
  autoRiaAiTimeoutMs: boundedInteger(process.env.AUTO_RIA_AI_TIMEOUT_MS, 5_000, 1_000, 60_000),
  aiAnalysisEnabled: process.env.AI_ANALYSIS_ENABLED === 'true',
  aiAnalysisApiKey: process.env.AI_ANALYSIS_API_KEY ?? '',
  aiAnalysisModelId: process.env.AI_ANALYSIS_MODEL_ID?.trim() || 'claude-opus-5',
  aiAnalysisMonthlyAllocation: boundedInteger(
    process.env.AI_ANALYSIS_MONTHLY_ALLOCATION,
    0,
    0,
    100_000,
  ),
  aiAnalysisPerAdminLimit: boundedInteger(process.env.AI_ANALYSIS_PER_ADMIN_LIMIT, 10, 0, 1_000),
  aiAnalysisPerAdminWindowHours: boundedInteger(
    process.env.AI_ANALYSIS_PER_ADMIN_WINDOW_HOURS,
    24,
    1,
    720,
  ),
  aiAnalysisTimeoutMs: boundedInteger(process.env.AI_ANALYSIS_TIMEOUT_MS, 60_000, 1_000, 300_000),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramAdminChatIds: (process.env.TELEGRAM_ADMIN_CHAT_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  nbuRateUrl:
    process.env.NBU_RATE_URL ?? 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json',
  rateBudgetPerHour: Number(process.env.RATE_BUDGET_PER_HOUR ?? 30),
  rateBudgetPoolPerMonth: Number(process.env.RATE_BUDGET_POOL_PER_MONTH ?? 20000),
  rateBudgetReservePct: Number(process.env.RATE_BUDGET_RESERVE_PCT ?? 15),
  rateBudgetCutoffThresholdPct: Number(process.env.RATE_BUDGET_CUTOFF_THRESHOLD_PCT ?? 10),
  defaultMinDealScore: Number(process.env.DEFAULT_MIN_DEAL_SCORE ?? 0.63),
  defaultConfidenceMinSamples: Number(process.env.DEFAULT_CONFIDENCE_MIN_SAMPLES ?? 10),
  mileageAnnualK: Number(process.env.MILEAGE_ANNUAL_K ?? 15),
  mileagePer10kPct: Number(process.env.MILEAGE_PER_10K_PCT ?? 2),
  mileageMaxAdjPct: Number(process.env.MILEAGE_MAX_ADJ_PCT ?? 20),
  logSourceRequests: process.env.LOG_SOURCE_REQUESTS === 'true',
  logLevel: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  calibrationMode: process.env.CALIBRATION_MODE === 'auto' ? 'auto' : 'propose',
  calibrationMinVolume: Number(process.env.CALIBRATION_MIN_VOLUME ?? 5),
  calibrationMaxVolume: Number(process.env.CALIBRATION_MAX_VOLUME ?? 20),
  calibrationMinPrecision: Number(process.env.CALIBRATION_MIN_PRECISION ?? 0.7),
  dealReminderDays: Number(process.env.DEAL_REMINDER_DAYS ?? 30),
});

function boundedNumber(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = boundedNumber(value, fallback, min, max);
  return Number.isInteger(parsed) ? parsed : fallback;
}
