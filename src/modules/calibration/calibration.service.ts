import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppConfig } from '../../common/config/configuration';
import { ListingsService } from '../listings/listings.service';
import { ProfilesService } from '../profiles/profiles.service';

import { CalibrationRun } from './entities/calibration-run.entity';
import { OutcomesService } from './outcomes.service';
import { CalibrationTarget, proposeThreshold } from './threshold-calibration';

/**
 * Orchestrates threshold auto-calibration runs (spec 002, E3a). PROPOSE-ONLY: this service
 * only records a proposal — it never mutates `SearchProfile.minDealScore` or any config.
 */
@Injectable()
export class CalibrationService {
  constructor(
    private readonly listings: ListingsService,
    private readonly outcomes: OutcomesService,
    private readonly profiles: ProfilesService,
    private readonly config: ConfigService<AppConfig, true>,
    @InjectRepository(CalibrationRun)
    private readonly repo: Repository<CalibrationRun>,
  ) {}

  private async globalPrecision(): Promise<{ precision: number | null; labeledCount: number }> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const labeled = await this.outcomes.manualLabeledSince(since);
    const good = labeled.filter((o) => o.label === 'good').length;
    const bad = labeled.filter((o) => o.label === 'bad').length;
    const labeledCount = good + bad;
    return { precision: labeledCount > 0 ? good / labeledCount : null, labeledCount };
  }

  async proposeThresholdRun(target: CalibrationTarget): Promise<CalibrationRun> {
    const scores = await this.listings.scoresForReport();
    const { precision, labeledCount } = await this.globalPrecision();
    const currentThreshold = this.config.get('defaultMinDealScore', { infer: true });

    const proposal = proposeThreshold({ scores, currentThreshold, precision, labeledCount }, target);

    const run = this.repo.create({
      capability: 'threshold',
      mode: 'propose',
      inputsSummary: { scoreCount: scores.length, currentThreshold, precision, labeledCount, target },
      proposal: { ...proposal },
      applied: false,
      reason: proposal.reason,
    });
    return this.repo.save(run);
  }

  /** Propose a threshold per enabled profile (per-profile scores; global precision for now). */
  async proposeAllProfiles(target: CalibrationTarget): Promise<CalibrationRun[]> {
    const profiles = await this.profiles.getEnabled();
    const { precision, labeledCount } = await this.globalPrecision();
    const runs: CalibrationRun[] = [];
    for (const profile of profiles) {
      const scores = await this.listings.scoresForReport(profile.id);
      const currentThreshold = profile.minDealScore;
      const proposal = proposeThreshold({ scores, currentThreshold, precision, labeledCount }, target);
      const run = this.repo.create({
        profileId: profile.id,
        capability: 'threshold',
        mode: 'propose',
        inputsSummary: { profileId: profile.id, scoreCount: scores.length, currentThreshold, precision, labeledCount, target },
        proposal: { ...proposal },
        applied: false,
        reason: proposal.reason,
      });
      runs.push(await this.repo.save(run));
    }
    return runs;
  }
}
