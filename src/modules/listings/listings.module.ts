import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DisappearancesService } from './disappearances.service';
import { ListingDisappearance } from './entities/listing-disappearance.entity';
import { Listing } from './entities/listing.entity';
import { PriceObservation } from './entities/price-observation.entity';
import { ListingsService } from './listings.service';

@Module({
  imports: [TypeOrmModule.forFeature([Listing, PriceObservation, ListingDisappearance])],
  providers: [ListingsService, DisappearancesService],
  exports: [ListingsService, DisappearancesService],
})
export class ListingsModule {}
