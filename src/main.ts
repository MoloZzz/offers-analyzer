import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  registerProcessErrorHandlers(logger);

  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
}

/**
 * Last-resort net (ADR-0008) for errors that escape Nest's DI/exception-filter pipeline — e.g. a
 * stray unawaited promise. Continuing after an uncaught exception risks running with corrupted
 * state, so we log with full context and exit; the process must run under a supervisor
 * (systemd/pm2/docker restart policy) that restarts it.
 */
function registerProcessErrorHandlers(logger: Logger): void {
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — exiting');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.fatal({ err }, 'Unhandled rejection — exiting');
    process.exit(1);
  });
}

void bootstrap();
