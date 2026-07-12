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
  defaultDiscountThresholdPct: number;
  defaultConfidenceMinSamples: number;
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
  defaultDiscountThresholdPct: Number(process.env.DEFAULT_DISCOUNT_THRESHOLD_PCT ?? 15),
  defaultConfidenceMinSamples: Number(process.env.DEFAULT_CONFIDENCE_MIN_SAMPLES ?? 10),
});
