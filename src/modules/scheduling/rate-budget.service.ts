import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

import { AppConfig } from '../../common/config/configuration';

/**
 * Hard cap on source API calls (AUTO.RIA free tier ~30/hour) — constitution §V, FR-012.
 * Fixed-window counter in Redis; conservative (a request that would exceed the cap is denied).
 */
@Injectable()
export class RateBudgetService implements OnModuleDestroy {
  private readonly logger = new Logger(RateBudgetService.name);
  private readonly redis: Redis;
  private readonly capacity: number;

  constructor(config: ConfigService<AppConfig, true>) {
    this.redis = new Redis(config.get('redisUrl', { infer: true }));
    this.capacity = config.get('rateBudgetPerHour', { infer: true });
  }

  /** Try to consume `cost` from the current hour's budget. Returns false if it would exceed the cap. */
  async tryConsume(sourceKey = 'auto-ria', cost = 1): Promise<boolean> {
    const key = this.windowKey(sourceKey);
    const used = await this.redis.incrby(key, cost);
    if (used === cost) {
      await this.redis.expire(key, 3600);
    }
    if (used > this.capacity) {
      this.logger.warn(`Rate budget exhausted for ${sourceKey} (used=${used}/${this.capacity})`);
      return false;
    }
    return true;
  }

  /** Remaining calls in the current hour window. */
  async remaining(sourceKey = 'auto-ria'): Promise<number> {
    const used = Number((await this.redis.get(this.windowKey(sourceKey))) ?? 0);
    return Math.max(0, this.capacity - used);
  }

  private windowKey(sourceKey: string): string {
    const now = new Date();
    const stamp =
      `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
      `${pad(now.getUTCHours())}`;
    return `ratebudget:${sourceKey}:${stamp}`;
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
