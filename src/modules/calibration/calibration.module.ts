import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Outcome } from './entities/outcome.entity';
import { ParameterSet } from './entities/parameter-set.entity';
import { OutcomesService } from './outcomes.service';
import { ParametersService } from './parameters.service';

@Module({
  imports: [TypeOrmModule.forFeature([ParameterSet, Outcome])],
  providers: [ParametersService, OutcomesService],
  exports: [ParametersService, OutcomesService],
})
export class CalibrationModule {}
