import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ListingsModule } from '../listings/listings.module';
import { ProfilesModule } from '../profiles/profiles.module';

import { CalibrationService } from './calibration.service';
import { CalibrationRun } from './entities/calibration-run.entity';
import { Outcome } from './entities/outcome.entity';
import { ParameterSet } from './entities/parameter-set.entity';
import { OutcomesService } from './outcomes.service';
import { ParametersService } from './parameters.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ParameterSet, Outcome, CalibrationRun]),
    ListingsModule,
    ProfilesModule,
  ],
  providers: [ParametersService, OutcomesService, CalibrationService],
  exports: [ParametersService, OutcomesService, CalibrationService],
})
export class CalibrationModule {}
