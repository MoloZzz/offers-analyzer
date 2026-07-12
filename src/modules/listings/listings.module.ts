import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Listing } from './entities/listing.entity';
import { PriceObservation } from './entities/price-observation.entity';
import { ListingsService } from './listings.service';

@Module({
  imports: [TypeOrmModule.forFeature([Listing, PriceObservation])],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
