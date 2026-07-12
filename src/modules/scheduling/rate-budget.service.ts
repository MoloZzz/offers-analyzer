import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppConfig } from '../../common/config/configuration';

/**
 * Hard cap on source API calls (AUTO.RIA free tier ~30/hour) — constitution §V, FR-012.
 * In-memory fixed-window counter: simplest thing that works for a single-instance v1 (no Redis).
 * Trade-off: the count resets on process restart (see backlog — durable counter if needed).
 */
@Injectable()
export class RateBudgetService {
  private readonly logger = new Logger(RateBudgetService.name);
  private readonly capacity: number;
  private readonly windows = new Map<string, number>();

  constructor(config: ConfigService<AppConfig, true>) {
    this.capacity = config.get('rateBudgetPerHour', { infer: true });
  }

  /** Try to consume `cost` from the current hour's budget. Returns false if it would exceed the cap. */
  // eslint-disable-next-line @typescript-eslint/require-await
  async tryConsume(sourceKey = 'auto-ria', cost = 1): Promise<boolean> {
    const key = this.windowKey(sourceKey);
    this.pruneExcept(key);
    const used = (this.windows.get(key) ?? 0) + cost;
    this.windows.set(key, used);
    if (used > this.capacity) {
      this.logger.warn(`Rate budget exhausted for ${sourceKey} (used=${used}/${this.capacity})`);
      return false;
    }
    return true;
  }

  /** Remaining calls in the current hour window. */
  remaining(sourceKey = 'auto-ria'): number {
    const used = this.windows.get(this.windowKey(sourceKey)) ?? 0;
    return Math.max(0, this.capacity - used);
  }

  private windowKey(sourceKey: string): string {
    const now = new Date();
    const stamp =
      `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
      `${pad(now.getUTCHours())}`;
    return `${sourceKey}:${stamp}`;
  }

  /** Drop stale windows so the map doesn't grow unbounded. */
  private pruneExcept(currentKey: string): void {
    for (const key of this.windows.keys()) {
      if (key !== currentKey) this.windows.delete(key);
    }
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
