import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Currency } from '../../common/types/money';

import { SearchProfile } from './entities/search-profile.entity';

/** Manages watch niches (operator-controlled in v1) and seeds one disabled example on first boot. */
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
    const count = await this.profiles.count();
    if (count > 0) return;

    // Seed a DISABLED example so nothing runs with placeholder ids. The operator fills real
    // AUTO.RIA marka_id/model_id and enables it. Category 1 = passenger cars.
    await this.profiles.save(
      this.profiles.create({
        name: 'Example niche (edit ids & enable)',
        sourceKey: 'auto-ria',
        categoryId: 1,
        filters: { makeModelPairs: [{ markId: 0, modelId: 0 }], yearFrom: 2015 },
        currency: Currency.USD,
        discountThresholdPct: 15,
        confidenceMinSamples: 10,
        dealerPolicy: 'label',
        enabled: false,
      }),
    );
    this.logger.log('Seeded a disabled example SearchProfile — set real ids and enable it.');
  }
}
