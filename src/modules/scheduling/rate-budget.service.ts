import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Repository } from 'typeorm';

import { AppConfig } from '../../common/config/configuration';

import { RateBudgetWindow } from './entities/rate-budget-window.entity';

/**
 * Hard cap on source API calls (AUTO.RIA free tier ~30/hour) — constitution §V, FR-012.
 * Durable fixed-window counter in Postgres: the count survives restarts (unlike the earlier
 * in-memory version), so we don't over-spend and hit HTTP 429 after a restart. See ADR-0004 (B13).
 */
@Injectable()
export class RateBudgetService {
  private readonly capacity: number;

  constructor(
    config: ConfigService<AppConfig, true>,
    @InjectRepository(RateBudgetWindow) private readonly repo: Repository<RateBudgetWindow>,
    @InjectPinoLogger(RateBudgetService.name) private readonly logger: PinoLogger,
  ) {
    this.capacity = config.get('rateBudgetPerHour', { infer: true });
  }

  /** Try to consume `cost` from the current hour's budget. Returns false if it would exceed the cap. */
  async tryConsume(sourceKey = 'auto-ria', cost = 1): Promise<boolean> {
    const windowKey = RateBudgetService.windowKey();
    const rows = (await this.repo.query(
      `INSERT INTO rate_budget_windows ("sourceKey", "windowKey", "used")
       VALUES ($1, $2, $3)
       ON CONFLICT ("sourceKey", "windowKey")
       DO UPDATE SET "used" = rate_budget_windows."used" + $3
       RETURNING "used"`,
      [sourceKey, windowKey, cost],
    )) as Array<{ used: string | number }>;
    const used = Number(rows[0]?.used ?? cost);

    if (used === cost) {
      // First consume of this window — prune older windows so the table stays tiny.
      await this.repo.query(
        `DELETE FROM rate_budget_windows WHERE "sourceKey" = $1 AND "windowKey" <> $2`,
        [sourceKey, windowKey],
      );
    }
    if (used > this.capacity) {
      this.logger.warn({ sourceKey, used, capacity: this.capacity }, 'Rate budget exhausted');
      return false;
    }
    return true;
  }

  /** Remaining calls in the current hour window. */
  async remaining(sourceKey = 'auto-ria'): Promise<number> {
    const row = await this.repo.findOne({
      where: { sourceKey, windowKey: RateBudgetService.windowKey() },
    });
    return Math.max(0, this.capacity - (row?.used ?? 0));
  }

  /** Force the current window to exhausted (e.g. the source returned HTTP 429). */
  async markExhausted(sourceKey = 'auto-ria'): Promise<void> {
    const windowKey = RateBudgetService.windowKey();
    await this.repo.query(
      `INSERT INTO rate_budget_windows ("sourceKey", "windowKey", "used")
       VALUES ($1, $2, $3)
       ON CONFLICT ("sourceKey", "windowKey")
       DO UPDATE SET "used" = GREATEST(rate_budget_windows."used", $3)`,
      [sourceKey, windowKey, this.capacity],
    );
  }

  private static windowKey(): string {
    const now = new Date();
    return (
      `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
      `${pad(now.getUTCHours())}`
    );
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
