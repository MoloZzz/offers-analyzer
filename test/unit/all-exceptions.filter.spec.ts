import { ArgumentsHost } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';

const noopLogger = { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} } as unknown as PinoLogger;

function makeHost(type: string, ctxArg?: unknown): ArgumentsHost {
  return {
    getType: () => type,
    getArgByIndex: () => ctxArg,
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  it('replies to the user on a telegraf exception', async () => {
    const filter = new AllExceptionsFilter(noopLogger);
    const reply = jest.fn().mockResolvedValue(undefined);
    const host = makeHost('telegraf', { reply });

    await filter.catch(new Error('boom'), host);

    expect(reply).toHaveBeenCalledWith('Сталася помилка. Спробуйте пізніше або /help.');
  });

  it('swallows a failure from ctx.reply itself', async () => {
    const filter = new AllExceptionsFilter(noopLogger);
    const reply = jest.fn().mockRejectedValue(new Error('chat blocked'));
    const host = makeHost('telegraf', { reply });

    await expect(filter.catch(new Error('boom'), host)).resolves.toBeUndefined();
  });

  it('does not attempt to reply outside the telegraf context', async () => {
    const filter = new AllExceptionsFilter(noopLogger);
    const host = makeHost('rpc');

    await expect(filter.catch(new Error('boom'), host)).resolves.toBeUndefined();
  });

  it('wraps a non-Error throw value', async () => {
    const filter = new AllExceptionsFilter(noopLogger);
    const reply = jest.fn().mockResolvedValue(undefined);
    const host = makeHost('telegraf', { reply });

    await expect(filter.catch('string thrown', host)).resolves.toBeUndefined();
    expect(reply).toHaveBeenCalled();
  });
});
