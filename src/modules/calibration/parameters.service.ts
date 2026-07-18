import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppConfig } from '../../common/config/configuration';

import { DEFAULT_UPLIFT_CAP, ParameterSet, ScoringParams } from './entities/parameter-set.entity';

/** Mileage-correction config consumed to build the v1 seed (values currently live in AppConfig). */
export interface MileageSeedConfig {
  mileageAnnualK: number;
  mileagePer10kPct: number;
  mileageMaxAdjPct: number;
}

/**
 * Pure builder for the v1 ScoringParams seed. `scale` and `softFlagPenalty` are the current
 * hard-coded constants (DEAL_SCORE_SCALE_PCT / SOFT_FLAG_PENALTY); mileage tunables come from
 * config. Exported standalone so the seed shape is unit-testable without a DB (spec SC-006).
 */
export function buildSeedParams(cfg: MileageSeedConfig): ScoringParams {
  return {
    scale: 30,
    softFlagPenalty: 0.8,
    ...cfg,
    // spec 003 factor config — seeded neutral (no factors ship in Phase F, so unconsumed).
    factorBounds: {},
    upliftCap: DEFAULT_UPLIFT_CAP,
    heuristicTableHashes: {},
  };
}

/**
 * Loads and caches the single ACTIVE ParameterSet, seeding v1 from current config on first boot
 * if none exists yet. Foundation of ADR-0005 — no scoring consumer reads from this yet.
 */
@Injectable()
export class ParametersService implements OnApplicationBootstrap {
  private active: ParameterSet | null = null;

  constructor(
    @InjectRepository(ParameterSet)
    private readonly repo: Repository<ParameterSet>,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const existingActive = await this.repo.findOne({ where: { active: true } });
    if (!existingActive) {
      const seed = this.repo.create({
        version: 1,
        active: true,
        origin: 'manual',
        reason: 'seed from config (ADR-0005)',
        params: buildSeedParams({
          mileageAnnualK: this.config.get('mileageAnnualK', { infer: true }),
          mileagePer10kPct: this.config.get('mileagePer10kPct', { infer: true }),
          mileageMaxAdjPct: this.config.get('mileageMaxAdjPct', { infer: true }),
        }),
      });
      await this.repo.save(seed);
    }

    await this.refresh();
  }

  /** Reload the active row into the cache. */
  async refresh(): Promise<void> {
    this.active = await this.repo.findOne({ where: { active: true } });
  }

  getActive(): ParameterSet {
    if (!this.active) {
      throw new Error('no active ParameterSet');
    }
    return this.active;
  }

  /** Convenience getter for the active scoring tunables. */
  params(): ScoringParams {
    return this.getActive().params;
  }

  /** Create a new INACTIVE candidate version (next version number) for operator review. */
  async createCandidate(params: ScoringParams, reason: string): Promise<ParameterSet> {
    const max = await this.repo.findOne({ where: {}, order: { version: 'DESC' } });
    const version = (max?.version ?? 0) + 1;
    const candidate = this.repo.create({ version, active: false, origin: 'calibration', reason, params });
    return this.repo.save(candidate);
  }

  /** Activate a version (deactivate all others) and refresh the cache. Returns it, or null if not found. */
  async activate(version: number): Promise<ParameterSet | null> {
    const target = await this.repo.findOne({ where: { version } });
    if (!target) return null;
    await this.repo.update({ active: true }, { active: false });
    target.active = true;
    await this.repo.save(target);
    await this.refresh();
    return target;
  }

  /** Most recent inactive candidate (highest version, not active), if any. */
  latestCandidate(): Promise<ParameterSet | null> {
    return this.repo.findOne({ where: { active: false }, order: { version: 'DESC' } });
  }
}
