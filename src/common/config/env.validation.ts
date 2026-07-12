/**
 * Fail fast on missing/invalid required configuration at startup.
 * Secrets are only *required* outside test/development bootstrap.
 */
const REQUIRED_ALWAYS = ['DATABASE_URL', 'REDIS_URL'] as const;
const REQUIRED_IN_PROD = ['AUTO_RIA_API_KEY', 'TELEGRAM_BOT_TOKEN'] as const;

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const missing: string[] = [];

  for (const key of REQUIRED_ALWAYS) {
    if (!config[key]) missing.push(key);
  }
  if (config.NODE_ENV === 'production') {
    for (const key of REQUIRED_IN_PROD) {
      if (!config[key]) missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return config;
}
