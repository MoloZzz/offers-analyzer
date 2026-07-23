import {
  buildDealCallback,
  buildDeclineReasonCallback,
  parseDealCallback,
} from '../../src/modules/notifications/telegram/deal-callback';
import { DECLINE_REASONS } from '../../src/modules/calibration/entities/deal-outcome.entity';

const OP_ID = '123e4567-e89b-12d3-a456-426614174000'; // 36-char uuid

describe('deal-callback codec', () => {
  it('roundtrips a bought action', () => {
    const data = buildDealCallback('bought', OP_ID);
    expect(parseDealCallback(data)).toEqual({ kind: 'action', action: 'bought', opportunityId: OP_ID });
  });

  it('roundtrips a decline action', () => {
    const data = buildDealCallback('decline', OP_ID);
    expect(parseDealCallback(data)).toEqual({
      kind: 'action',
      action: 'decline',
      opportunityId: OP_ID,
    });
  });

  it('roundtrips every decline reason', () => {
    for (const reason of DECLINE_REASONS) {
      const data = buildDeclineReasonCallback(reason, OP_ID);
      expect(parseDealCallback(data)).toEqual({ kind: 'reason', reason, opportunityId: OP_ID });
    }
  });

  it('stays within Telegram 64-byte callback_data limit', () => {
    for (const reason of DECLINE_REASONS) {
      const data = buildDeclineReasonCallback(reason, OP_ID);
      expect(Buffer.byteLength(data, 'utf8')).toBeLessThanOrEqual(64);
    }
    expect(Buffer.byteLength(buildDealCallback('decline', OP_ID), 'utf8')).toBeLessThanOrEqual(64);
  });

  it('returns null for foreign / malformed data', () => {
    expect(parseDealCallback('oc:good:xyz')).toBeNull();
    expect(parseDealCallback('dl:unknown:xyz')).toBeNull();
    expect(parseDealCallback('dl:r:bogus:xyz')).toBeNull();
    expect(parseDealCallback('garbage')).toBeNull();
  });
});
