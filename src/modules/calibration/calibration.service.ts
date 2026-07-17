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

export interface CalibrationLine {
  profileName: string;
  before: number | null;
  after: number | null;
  applied: boolean;
  reason: string;
}

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

  /** The operator-configured calibration target (volume corridor + precision floor). */
  targetFromConfig(): CalibrationTarget {
    return {
      minVolume: this.config.get('calibrationMinVolume', { infer: true }),
      maxVolume: this.config.get('calibrationMaxVolume', { infer: true }),
      minPrecision: this.config.get('calibrationMinPrecision', { infer: true }),
    };
  }

  /** Apply a run's proposal to its profile's threshold (bounded value already computed). Idempotent. */
  async applyProposal(run: CalibrationRun): Promise<CalibrationRun> {
    const proposed = (run.proposal as { proposed: number | null } | null)?.proposed ?? null;
    if (run.applied || run.profileId == null || proposed == null) return run;
    await this.profiles.setThreshold(run.profileId, proposed);
    run.applied = true;
    return this.repo.save(run);
  }

  /** Run per-profile proposals; in 'auto' mode also apply them. Returns the runs. */
  async runCalibration(mode: 'propose' | 'auto', target?: CalibrationTarget): Promise<CalibrationRun[]> {
    const runs = await this.proposeAllProfiles(target ?? this.targetFromConfig());
    if (mode === 'auto') {
      for (const run of runs) await this.applyProposal(run);
    }
    return runs;
  }

  /** Revert a profile's threshold to the value it had before the last applied calibration. */
  async revert(profileId: string): Promise<number | null> {
    const last = await this.repo.findOne({
      where: { profileId, applied: true },
      order: { ranAt: 'DESC' },
    });
    if (!last) return null;
    const before = (last.inputsSummary as { currentThreshold?: number } | null)?.currentThreshold;
    if (typeof before !== 'number') return null;
    await this.profiles.setThreshold(profileId, before);
    return before;
  }

  configuredMode(): 'propose' | 'auto' {
    return this.config.get('calibrationMode', { infer: true });
  }

  /** Run calibration and map each run to a human summary line (profile name, before→after, applied). */
  async runAndSummarize(mode: 'propose' | 'auto'): Promise<CalibrationLine[]> {
    const profiles = await this.profiles.getEnabled();
    const byId = new Map(profiles.map((p) => [p.id, p.name]));
    const runs = await this.runCalibration(mode);
    return runs.map((r) => {
      const proposal = r.proposal as { proposed: number | null; reason: string } | null;
      const before = (r.inputsSummary as { currentThreshold?: number } | null)?.currentThreshold ?? null;
      return {
        profileName: byId.get(r.profileId ?? '') ?? '—',
        before,
        after: proposal?.proposed ?? null,
        applied: r.applied,
        reason: proposal?.reason ?? '',
      };
    });
  }
}
