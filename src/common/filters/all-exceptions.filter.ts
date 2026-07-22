import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Context } from 'telegraf';

/**
 * Global safety net (ADR-0008): one bad Telegram update or unexpected error must not crash the
 * bot or go unlogged. Registered as APP_FILTER so it wraps every command/action handler.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(AllExceptionsFilter.name) private readonly logger: PinoLogger) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error({ err }, 'Unhandled exception');

    if (host.getType<string>() !== 'telegraf') return;

    const ctx = host.getArgByIndex<Context>(0);
    try {
      await ctx?.reply('Сталася помилка. Спробуйте пізніше або /help.');
    } catch (replyErr) {
      this.logger.warn({ err: replyErr }, 'Failed to notify user after error');
    }
  }
}
