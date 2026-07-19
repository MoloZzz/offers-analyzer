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

  /** Find a profile by name (for bot commands). */
  async findByName(name: string): Promise<SearchProfile | null> {
    return this.profiles.findOne({ where: { name } });
  }

  /** Set a profile's threshold directly (used by calibration apply/revert, spec 002, E3). */
  async setThreshold(profileId: string, minDealScore: number): Promise<void> {
    await this.profiles.update({ id: profileId }, { minDealScore });
  }

  /** Update a profile's excludeMakeModels blacklist. */
  async setExcludeMakeModels(profileId: string, excludeList: string[]): Promise<void> {
    await this.profiles.update(
      { id: profileId },
      { filters: () => `jsonb_set(filters, '{excludeMakeModels}', '${JSON.stringify(excludeList)}'::jsonb)` },
    );
  }

  /** Add items to a profile's blacklist. */
  async addToBlacklist(profileId: string, items: string[]): Promise<string[]> {
    const profile = await this.profiles.findOne({ where: { id: profileId } });
    if (!profile) throw new Error(`Profile ${profileId} not found`);
    const current = profile.filters?.excludeMakeModels ?? [];
    const merged = [...new Set([...current, ...items.map((i) => i.trim())])];
    await this.setExcludeMakeModels(profileId, merged);
    return merged;
  }

  /** Remove items from a profile's blacklist. */
  async removeFromBlacklist(profileId: string, items: string[]): Promise<string[]> {
    const profile = await this.profiles.findOne({ where: { id: profileId } });
    if (!profile) throw new Error(`Profile ${profileId} not found`);
    const current = profile.filters?.excludeMakeModels ?? [];
    const toRemove = new Set(items.map((i) => i.trim().toLowerCase()));
    const merged = current.filter((i) => !toRemove.has(i.toLowerCase()));
    await this.setExcludeMakeModels(profileId, merged);
    return merged;
  }

  /** Clear a profile's blacklist entirely. */
  async clearBlacklist(profileId: string): Promise<void> {
    await this.setExcludeMakeModels(profileId, []);
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
      // minDealScore is only seeded on first creation; once a profile exists, calibration
      // (spec 002, E3) owns it, so re-syncing from JSON on every boot would clobber applied
      // proposals.
      if (!existing) {
        entity.minDealScore = cfg.minDealScore;
      }
      entity.confidenceMinSamples = cfg.confidenceMinSamples;
      entity.dealerPolicy = cfg.dealerPolicy;
      entity.enabled = cfg.enabled;
      await this.profiles.save(entity);
    }
    this.logger.log(`Synced ${configs.length} search profile(s) from ${file}`);
  }
}
