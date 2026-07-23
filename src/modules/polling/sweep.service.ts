import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { RateBudgetExhaustedError } from '../../common/errors/domain-error';
import { OutcomesService } from '../calibration/outcomes.service';
import { SWEEP_GRACE_HOURS } from '../listings/disappearance';
import { DisappearancesService } from '../listings/disappearances.service';
import { ProfilesService } from '../profiles/profiles.service';
import { SearchProfile } from '../profiles/entities/search-profile.entity';
import { ListingSource, LISTING_SOURCE } from '../sources/ports/listing-source.port';

import { toQuery } from './poll.service';

/** Daily at 03:30 — off-peak, well clear of the 10-minute poll's traffic. */
const SWEEP_CRON = '30 3 * * *';
/** Hard safety cap on pages per sweep profile (~25k ids at 100/page) so a runaway/miscounted
 * `total` can never turn the crawl into an unbounded loop against the shared budget. */
const MAX_SWEEP_PAGES = 250;

/**
 * Daily market-wide sweep (SPEC-004 US4.1b): pages a sweep profile's search to ids-only
 * completeness, then runs the same disappearance detection as the poll cycle but with a
 * 30h grace (`SWEEP_GRACE_HOURS`) so one missed/failed sweep never records an event. Detection
 * only ever runs on a *complete* crawl (FR-411) — a budget-aborted or capped crawl is discarded.
 */
@Injectable()
export class SweepService {
  constructor(
    private readonly profiles: ProfilesService,
    @Inject(LISTING_SOURCE) private readonly source: ListingSource,
    private readonly disappearances: DisappearancesService,
    private readonly outcomes: OutcomesService,
    @InjectPinoLogger(SweepService.name) private readonly logger: PinoLogger,
  ) {}

  @Cron(SWEEP_CRON)
  async sweep(): Promise<void> {
    try {
      const profiles = (await this.profiles.getEnabled()).filter((p) => p.filters.sweep === true);
      for (const profile of profiles) {
        // Budget is shared across profiles: an exhausted crawl means nothing further can run
        // today either, so stop the whole sweep rather than trying the next profile.
        const budgetExhausted = await this.sweepProfile(profile);
        if (budgetExhausted) return;
      }
    } catch (err) {
      this.logger.error({ err }, 'Sweep cycle failed');
    }
  }

  /** Crawls and (if complete) processes one sweep profile. Returns true iff the shared budget
   * was exhausted mid-crawl — the caller must stop sweeping entirely in that case. */
  private async sweepProfile(profile: SearchProfile): Promise<boolean> {
    let page = 0;
    let pagesCalled = 0;
    const ids = new Set<string>();
    let total: number | undefined;
    let complete = false;

    try {
      for (;;) {
        const result = await this.source.search({ ...toQuery(profile), page });
        pagesCalled++;
        total = result.total;
        for (const id of result.ids) ids.add(id);

        if (result.ids.length === 0 || result.ids.length < 100 || (total != null && ids.size >= total)) {
          complete = true;
          break;
        }
        if (page >= MAX_SWEEP_PAGES) {
          this.logger.warn(
            { profile: profile.name, pages: pagesCalled, ids: ids.size, total },
            'Sweep hit MAX_SWEEP_PAGES cap — treating as incomplete, skipping detection',
          );
          break;
        }
        page++;
      }
    } catch (err) {
      if (err instanceof RateBudgetExhaustedError) {
        this.logger.info(
          { profile: profile.name, pages: pagesCalled, ids: ids.size },
          'Sweep budget exhausted mid-crawl — incomplete, retrying tomorrow',
        );
        return true;
      }
      this.logger.error({ err, profile: profile.name }, 'Sweep failed for profile — skipping');
      return false;
    }

    if (!complete) return false;

    const events = await this.disappearances.processCycle(ids, [profile], SWEEP_GRACE_HOURS);
    for (const event of events) {
      await this.outcomes.recordPassive({ listingId: event.listingId, label: 'disappeared' });
    }

    this.logger.info(
      { profile: profile.name, pages: pagesCalled, ids: ids.size, total, complete, recorded: events.length },
      'Sweep complete',
    );
    return false;
  }
}
