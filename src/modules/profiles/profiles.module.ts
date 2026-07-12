import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SearchProfile } from './entities/search-profile.entity';
import { ProfilesService } from './profiles.service';

@Module({
  imports: [TypeOrmModule.forFeature([SearchProfile])],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
