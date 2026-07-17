import {
  buildOutcomeCallback,
  parseOutcomeCallback,
} from '../../src/modules/notifications/telegram/outcome-callback';

describe('outcome-callback', () => {
  it('encodes a good/bad label + opportunityId into callback_data', () => {
    expect(buildOutcomeCallback('good', 'abc-123')).toBe('oc:good:abc-123');
  });

  it('round-trips build -> parse', () => {
    const opportunityId = '2f6b1e2a-8f1b-4e60-9d1a-6f0d3b0c9a11';
    const data = buildOutcomeCallback('bad', opportunityId);
    expect(parseOutcomeCallback(data)).toEqual({ label: 'bad', opportunityId });
  });

  it('returns null for garbage input', () => {
    expect(parseOutcomeCallback('garbage')).toBeNull();
  });

  it('returns null for an unrecognized label', () => {
    expect(parseOutcomeCallback('oc:maybe:x')).toBeNull();
  });

  it('stays under the Telegram callback_data 64-byte limit for a uuid', () => {
    const opportunityId = '2f6b1e2a-8f1b-4e60-9d1a-6f0d3b0c9a11';
    expect(opportunityId.length).toBe(36);
    expect(buildOutcomeCallback('good', opportunityId).length).toBeLessThan(64);
  });
});
