/**
 * Typed application configuration, loaded from environment (constitution §V: no secrets in code).
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  autoRiaApiKey: string;
  telegramBotToken: string;
  nbuRateUrl: string;
  rateBudgetPerHour: number;
  defaultMinDealScore: number;
  defaultConfidenceMinSamples: number;
  /** When true, log every outbound request + raw response to external sources (api_key redacted). */
  logSourceRequests: boolean;
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  autoRiaApiKey: process.env.AUTO_RIA_API_KEY ?? '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  nbuRateUrl:
    process.env.NBU_RATE_URL ??
    'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json',
  rateBudgetPerHour: Number(process.env.RATE_BUDGET_PER_HOUR ?? 30),
  defaultMinDealScore: Number(process.env.DEFAULT_MIN_DEAL_SCORE ?? 0.15),
  defaultConfidenceMinSamples: Number(process.env.DEFAULT_CONFIDENCE_MIN_SAMPLES ?? 10),
  logSourceRequests: process.env.LOG_SOURCE_REQUESTS === 'true',
});
