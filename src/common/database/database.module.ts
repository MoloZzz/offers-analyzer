import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppConfig } from '../config/configuration';
import { buildDataSourceOptions } from './data-source';

/**
 * Wires TypeORM using typed config. Schema changes go through **migrations** (never `synchronize`)
 * so dev and prod evolve identically and reproducibly. Run `npm run migration:run`.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        buildDataSourceOptions(config.get('databaseUrl', { infer: true }), false),
    }),
  ],
})
export class DatabaseModule {}
