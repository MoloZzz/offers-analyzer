import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SourceControl } from './entities/source-control.entity';

@Injectable()
export class SourceControlService {
  constructor(
    @InjectRepository(SourceControl) private readonly controls: Repository<SourceControl>,
  ) {}

  async isDailyLimitEnabled(sourceKey: string): Promise<boolean> {
    const control = await this.controls.findOne({ where: { sourceKey } });
    return control?.dailyLimitEnabled ?? true;
  }

  async setDailyLimitEnabled(sourceKey: string, enabled: boolean): Promise<boolean> {
    await this.controls.upsert({ sourceKey, dailyLimitEnabled: enabled }, ['sourceKey']);
    return enabled;
  }
}
