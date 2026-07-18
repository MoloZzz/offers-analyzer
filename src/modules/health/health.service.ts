import { Injectable } from '@nestjs/common';

/** In-memory liveness of the poll loop. Shared singleton (exported by HealthModule). */
@Injectable()
export class HealthService {
  private lastSuccessAt: Date = new Date(); // start with a grace window from boot
  private failuresInARow = 0;

  markPollSuccess(): void {
    this.lastSuccessAt = new Date();
    this.failuresInARow = 0;
  }

  markPollFailure(): void {
    this.failuresInARow += 1;
  }

  getLastSuccessAt(): Date {
    return this.lastSuccessAt;
  }

  getFailuresInARow(): number {
    return this.failuresInARow;
  }

  minutesSinceSuccess(now: Date = new Date()): number {
    return (now.getTime() - this.lastSuccessAt.getTime()) / 60000;
  }
}
