import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AlertedCar } from './entities/alerted-car.entity';

export type RelistDecision = 'first' | 'cheaper' | 'suppress';

/** Pure rule: alert a car the first time, or when it's cheaper than the lowest we ever alerted. */
export function decideRelistAlert(lowestAlertedUsd: number | null, askingUsd: number): RelistDecision {
  if (lowestAlertedUsd == null) return 'first';
  if (askingUsd < lowestAlertedUsd) return 'cheaper';
  return 'suppress';
}

/** Car-level de-dup across relists (identity = VIN), so we don't re-alert the same car unless cheaper. */
@Injectable()
export class AlertedCarsService {
  constructor(@InjectRepository(AlertedCar) private readonly repo: Repository<AlertedCar>) {}

  /** Decide whether to alert this car, and record the new lowest when we do. */
  async decideAndRecord(carKey: string, askingUsd: number, listingId: string): Promise<RelistDecision> {
    const existing = await this.repo.findOne({ where: { carKey } });
    const decision = decideRelistAlert(existing?.lowestAlertedUsd ?? null, askingUsd);
    if (decision === 'first') {
      await this.repo.save(
        this.repo.create({ carKey, lowestAlertedUsd: askingUsd, lastListingId: listingId, lastAlertedAt: new Date() }),
      );
    } else if (decision === 'cheaper' && existing) {
      existing.lowestAlertedUsd = askingUsd;
      existing.lastListingId = listingId;
      existing.lastAlertedAt = new Date();
      await this.repo.save(existing);
    }
    return decision;
  }
}
