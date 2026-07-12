import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppConfig } from '../config/configuration';
import { buildDataSourceOptions } from './data-source';

/** Wires TypeORM using typed config. Schema is auto-synced outside production; prod uses migrations. */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        buildDataSourceOptions(
          config.get('databaseUrl', { infer: true }),
          config.get('nodeEnv', { infer: true }) !== 'production',
        ),
    }),
  ],
})
export class DatabaseModule {}
