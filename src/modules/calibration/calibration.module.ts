import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ParameterSet } from './entities/parameter-set.entity';
import { ParametersService } from './parameters.service';

@Module({
  imports: [TypeOrmModule.forFeature([ParameterSet])],
  providers: [ParametersService],
  exports: [ParametersService],
})
export class CalibrationModule {}
