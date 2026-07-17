import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppConfig } from '../../common/config/configuration';
import { ListingsService } from '../listings/listings.service';

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
    private readonly config: ConfigService<AppConfig, true>,
    @InjectRepository(CalibrationRun)
    private readonly repo: Repository<CalibrationRun>,
  ) {}

  async proposeThresholdRun(target: CalibrationTarget): Promise<CalibrationRun> {
    const scores = await this.listings.scoresForReport();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const labeled = await this.outcomes.manualLabeledSince(since);
    const good = labeled.filter((o) => o.label === 'good').length;
    const bad = labeled.filter((o) => o.label === 'bad').length;
    const labeledCount = good + bad;
    const precision = labeledCount > 0 ? good / labeledCount : null;
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
}
