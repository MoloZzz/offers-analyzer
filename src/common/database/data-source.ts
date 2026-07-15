import 'dotenv/config';
import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';

import { Listing } from '../../modules/listings/entities/listing.entity';
import { PriceObservation } from '../../modules/listings/entities/price-observation.entity';
import { Notification } from '../../modules/notifications/entities/notification.entity';
import { Subscriber } from '../../modules/notifications/entities/subscriber.entity';
import { SearchProfile } from '../../modules/profiles/entities/search-profile.entity';
import { FairValueBenchmark } from '../../modules/valuation/entities/fair-value-benchmark.entity';
import { Opportunity } from '../../modules/valuation/entities/opportunity.entity';

/** All persistent entities — single source of truth for the datasource and TypeOrmModule. */
export const ENTITIES = [
  SearchProfile,
  Listing,
  PriceObservation,
  FairValueBenchmark,
  Opportunity,
  Subscriber,
  Notification,
];

export function buildDataSourceOptions(url: string, synchronize: boolean): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: ENTITIES,
    migrations: [__dirname + '/migrations/*.{ts,js}'],
    synchronize,
    logging: false,
  };
}

/** Standalone datasource used by the TypeORM CLI (migrations). App wiring uses TypeOrmModule. */
const AppDataSource = new DataSource(buildDataSourceOptions(process.env.DATABASE_URL ?? '', false));

export default AppDataSource;
