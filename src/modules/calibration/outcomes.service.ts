import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';

import { ManualLabel, Outcome, PassiveLabel } from './entities/outcome.entity';

/** Input for a human-recorded outcome. */
export interface RecordManualInput {
  listingId: string;
  opportunityId?: string | null;
  label: ManualLabel;
  value?: number | null;
  note?: string | null;
}

/** Input for a system-observed outcome. */
export interface RecordPassiveInput {
  listingId: string;
  label: PassiveLabel;
}

/**
 * Persists Outcomes — the ground truth of what happened to flagged listings (spec 002, E2/US1).
 * Not wired into any consumer yet; this is the data layer only.
 */
@Injectable()
export class OutcomesService {
  constructor(
    @InjectRepository(Outcome)
    private readonly repo: Repository<Outcome>,
  ) {}

  /**
   * Records a manual (human) label. Idempotent per opportunity: re-labeling the same
   * opportunity updates the existing row instead of creating a duplicate. When no
   * opportunityId is given there is nothing to dedup against, so a new row is always created.
   */
  async recordManual(input: RecordManualInput): Promise<Outcome> {
    const opportunityId = input.opportunityId ?? null;

    if (opportunityId) {
      const existing = await this.repo.findOne({
        where: { source: 'manual', opportunityId },
      });
      if (existing) {
        existing.label = input.label;
        existing.value = input.value ?? null;
        existing.note = input.note ?? null;
        return this.repo.save(existing);
      }
    }

    const created = this.repo.create({
      listingId: input.listingId,
      opportunityId,
      source: 'manual',
      label: input.label,
      value: input.value ?? null,
      note: input.note ?? null,
    });
    return this.repo.save(created);
  }

  /**
   * Records a passive (system-observed) signal. Deduped on (listingId, label) — repeated
   * observations of the same signal for the same listing are no-ops.
   */
  async recordPassive(input: RecordPassiveInput): Promise<Outcome | null> {
    const existing = await this.repo.findOne({
      where: { source: 'passive', listingId: input.listingId, label: input.label },
    });
    if (existing) {
      return existing;
    }

    const created = this.repo.create({
      listingId: input.listingId,
      opportunityId: null,
      source: 'passive',
      label: input.label,
      value: null,
      note: null,
    });
    return this.repo.save(created);
  }

  /** Manual good/bad labels recorded on or after `since` — feeds later precision computation. */
  async manualLabeledSince(since: Date): Promise<Outcome[]> {
    return this.repo.find({
      where: {
        source: 'manual',
        label: In(['good', 'bad']),
        createdAt: MoreThanOrEqual(since),
      },
    });
  }
}
