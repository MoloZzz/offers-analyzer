import { validateEnv } from '../../src/common/config/env.validation';

describe('validateEnv', () => {
  it('keeps the AI provider optional while it is disabled', () => {
    expect(validateEnv({ DATABASE_URL: 'postgres://test' })).toMatchObject({
      DATABASE_URL: 'postgres://test',
    });
  });

  it('fails closed when a paid AI provider is enabled without credentials or allocation', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: 'postgres://test', AUTO_RIA_AI_ENABLED: 'true' }),
    ).toThrow('AUTO_RIA_AI_API_KEY, AUTO_RIA_AI_USER_ID');
  });

  it('requires a positive explicit allocation when the provider is enabled', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgres://test',
        AUTO_RIA_AI_ENABLED: 'true',
        AUTO_RIA_AI_API_KEY: 'key',
        AUTO_RIA_AI_USER_ID: 'user',
        AUTO_RIA_AI_MONTHLY_ALLOCATION: '0',
      }),
    ).toThrow('AUTO_RIA_AI_MONTHLY_ALLOCATION');
  });
});
