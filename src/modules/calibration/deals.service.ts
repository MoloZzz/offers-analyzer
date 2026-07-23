import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DealPatch, deriveStage } from './deal-margin';
import { DealOutcome, DeclineReason } from './entities/deal-outcome.entity';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Persists post-deal outcomes (SPEC-007 US7.1–7.2) — the operator's real economics after an alert.
 * One row per listing, upserted as the deal progresses (declined → bought → sold). Separate from
 * the append-style `outcomes` label stream, so spec 002's precision tuning is unaffected until
 * CHANGE-002.1 (US7.3) deliberately re-targets it.
 */
@Injectable()
export class DealsService {
  constructor(
    @InjectRepository(DealOutcome)
    private readonly repo: Repository<DealOutcome>,
  ) {}

  /**
   * Upsert the deal for a listing, applying only the supplied fields. Idempotent per listing
   * (unique `listingId`): a second call patches the same row. `stage` derives monotonically —
   * a `sold` deal is never knocked back by a later buy-only patch. `boughtAt`/`soldAt` are
   * stamped once, on the first transition into that stage.
   */
  async upsertForListing(
    listingId: string,
    patch: DealPatch,
    opportunityId?: string | null,
    now: Date = new Date(),
  ): Promise<DealOutcome> {
    const existing = await this.repo.findOne({ where: { listingId } });
    const row = existing ?? this.repo.create({ listingId, stage: 'bought' });

    if (opportunityId != null && row.opportunityId == null) row.opportunityId = opportunityId;

    if (patch.buyPriceUsd != null) row.buyPriceUsd = patch.buyPriceUsd;
    if (patch.actualCostsUsd != null) row.actualCostsUsd = patch.actualCostsUsd;
    if (patch.sellPriceUsd != null) row.sellPriceUsd = patch.sellPriceUsd;
    if (patch.daysOnMarket != null) row.daysOnMarket = patch.daysOnMarket;
    if (patch.declineReason != null) row.declineReason = patch.declineReason as DeclineReason;
    if (patch.note != null) row.note = patch.note;

    const nextStage = deriveStage(existing ? existing.stage : null, patch);
    row.stage = nextStage;
    if (nextStage === 'bought' && row.boughtAt == null) row.boughtAt = now;
    if (nextStage === 'sold') {
      if (row.boughtAt == null) row.boughtAt = now; // sold directly (no prior bought tap)
      if (row.soldAt == null) row.soldAt = now;
    }

    return this.repo.save(row);
  }

  /** One-tap 🛒 Купив: mark the listing bought (no economics yet; overrides an earlier decline). */
  markBought(
    listingId: string,
    opportunityId?: string | null,
    now: Date = new Date(),
  ): Promise<DealOutcome> {
    return this.upsertForListing(listingId, { intent: 'bought' }, opportunityId, now);
  }

  /** One-tap ❌ Відмова + reason: mark the listing declined (unless already bought/sold). */
  markDeclined(
    listingId: string,
    reason: DeclineReason,
    opportunityId?: string | null,
    now: Date = new Date(),
  ): Promise<DealOutcome> {
    return this.upsertForListing(listingId, { declineReason: reason }, opportunityId, now);
  }

  /** Deals bought but not yet sold. */
  openDeals(): Promise<DealOutcome[]> {
    return this.repo.find({ where: { stage: 'bought' } });
  }

  /** Closed deals — sold with both buy and sell prices present (the realized-margin feed, US7.3). */
  async closedDeals(): Promise<DealOutcome[]> {
    const sold = await this.repo.find({ where: { stage: 'sold' } });
    return sold.filter((d) => d.buyPriceUsd != null && d.sellPriceUsd != null);
  }

  /** Most recently touched deals (for /deals), newest first. */
  recent(limit = 10): Promise<DealOutcome[]> {
    return this.repo.find({ order: { updatedAt: 'DESC' }, take: limit });
  }

  /**
   * Bought-but-unsold deals whose last activity (bought or last reminded) is older than
   * `reminderDays` — nudged once per window, never daily. Volume is tiny (one operator), so the
   * max(boughtAt, lastRemindedAt) comparison is done in memory.
   */
  async dueForReminder(now: Date, reminderDays: number): Promise<DealOutcome[]> {
    const cutoff = now.getTime() - reminderDays * DAY_MS;
    const open = await this.repo.find({ where: { stage: 'bought' } });
    return open.filter((d) => {
      const last = Math.max(d.lastRemindedAt?.getTime() ?? 0, d.boughtAt?.getTime() ?? 0);
      return last > 0 && last < cutoff;
    });
  }

  async markReminded(id: string, at: Date): Promise<void> {
    await this.repo.update({ id }, { lastRemindedAt: at });
  }
}
