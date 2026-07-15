import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Currency } from '../../common/types/money';

import { DealerPolicy, ProfileFilters, SearchProfile } from './entities/search-profile.entity';

/** Declarative operator config for a watch niche (v1: a JSON file, no UI). */
interface SearchProfileConfig {
  name: string;
  categoryId: number;
  stateId?: number | null;
  cityId?: number | null;
  filters: ProfileFilters;
  priceFrom?: number | null;
  priceTo?: number | null;
  currency: Currency;
  minDealScore: number;
  confidenceMinSamples: number;
  dealerPolicy: DealerPolicy;
  enabled: boolean;
}

/**
 * Manages watch niches. In v1 the operator defines them declaratively in
 * `config/search-profiles.json` (path overridable via `SEARCH_PROFILES_FILE`); they are
 * upserted by `name` on every boot, so editing the file + restart syncs them. FR-010.
 */
@Injectable()
export class ProfilesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(
    @InjectRepository(SearchProfile) private readonly profiles: Repository<SearchProfile>,
  ) {}

  getEnabled(): Promise<SearchProfile[]> {
    return this.profiles.find({ where: { enabled: true } });
  }

  async onApplicationBootstrap(): Promise<void> {
    const file =
      process.env.SEARCH_PROFILES_FILE ?? join(process.cwd(), 'config', 'search-profiles.json');
    if (!existsSync(file)) {
      this.logger.warn(`No profiles config at ${file} — nothing to monitor. See config/search-profiles.example.json`);
      return;
    }

    const configs = JSON.parse(readFileSync(file, 'utf8')) as SearchProfileConfig[];
    for (const cfg of configs) {
      const existing = await this.profiles.findOne({ where: { name: cfg.name } });
      const entity = existing ?? this.profiles.create();
      entity.name = cfg.name;
      entity.sourceKey = 'auto-ria';
      entity.categoryId = cfg.categoryId;
      entity.stateId = cfg.stateId ?? null;
      entity.cityId = cfg.cityId ?? null;
      entity.filters = cfg.filters;
      entity.priceFrom = cfg.priceFrom ?? null;
      entity.priceTo = cfg.priceTo ?? null;
      entity.currency = cfg.currency;
      entity.minDealScore = cfg.minDealScore;
      entity.confidenceMinSamples = cfg.confidenceMinSamples;
      entity.dealerPolicy = cfg.dealerPolicy;
      entity.enabled = cfg.enabled;
      await this.profiles.save(entity);
    }
    this.logger.log(`Synced ${configs.length} search profile(s) from ${file}`);
  }
}
