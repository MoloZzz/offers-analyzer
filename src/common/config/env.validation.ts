/**
 * Fail fast on missing/invalid required configuration at startup.
 * Secrets are only *required* outside test/development bootstrap.
 */
const REQUIRED_ALWAYS = ['DATABASE_URL'] as const;
const REQUIRED_IN_PROD = ['AUTO_RIA_API_KEY', 'TELEGRAM_BOT_TOKEN'] as const;

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const key of REQUIRED_ALWAYS) {
    if (!config[key]) missing.push(key);
  }
  if (config.NODE_ENV === 'production') {
    for (const key of REQUIRED_IN_PROD) {
      if (!config[key]) missing.push(key);
    }
  }

  // A paid provider must never be accidentally enabled with incomplete or effectively unbounded
  // settings. Disabled shadow mode intentionally requires none of these values.
  if (config.AUTO_RIA_AI_ENABLED === 'true') {
    for (const key of ['AUTO_RIA_AI_API_KEY', 'AUTO_RIA_AI_USER_ID']) {
      if (!config[key]) missing.push(key);
    }
    const allocation = Number(config.AUTO_RIA_AI_MONTHLY_ALLOCATION);
    if (!Number.isInteger(allocation) || allocation <= 0) {
      invalid.push('AUTO_RIA_AI_MONTHLY_ALLOCATION (positive integer required when enabled)');
    }
  }

  // SPEC-017: the same discipline for the advisory analysis provider. Enabling it without a key or
  // with an unbounded cap would put paid, operator-triggered traffic behind a flag alone.
  if (config.AI_ANALYSIS_ENABLED === 'true') {
    if (!config.AI_ANALYSIS_API_KEY) missing.push('AI_ANALYSIS_API_KEY');
    const allocation = Number(config.AI_ANALYSIS_MONTHLY_ALLOCATION);
    if (!Number.isInteger(allocation) || allocation <= 0) {
      invalid.push('AI_ANALYSIS_MONTHLY_ALLOCATION (positive integer required when enabled)');
    }
    const perAdmin = Number(config.AI_ANALYSIS_PER_ADMIN_LIMIT);
    if (config.AI_ANALYSIS_PER_ADMIN_LIMIT !== undefined && (!Number.isInteger(perAdmin) || perAdmin <= 0)) {
      invalid.push('AI_ANALYSIS_PER_ADMIN_LIMIT (positive integer required when enabled)');
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if (invalid.length > 0) {
    throw new Error(`Invalid environment variables: ${invalid.join(', ')}`);
  }
  return config;
}
