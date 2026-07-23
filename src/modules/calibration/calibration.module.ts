import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ListingsModule } from '../listings/listings.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { Opportunity } from '../valuation/entities/opportunity.entity';

import { CalibrationService } from './calibration.service';
import { DealsService } from './deals.service';
import { CalibrationRun } from './entities/calibration-run.entity';
import { DealOutcome } from './entities/deal-outcome.entity';
import { Outcome } from './entities/outcome.entity';
import { ParameterSet } from './entities/parameter-set.entity';
import { OutcomesService } from './outcomes.service';
import { ParametersService } from './parameters.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ParameterSet, Outcome, CalibrationRun, DealOutcome, Opportunity]),
    ListingsModule,
    ProfilesModule,
  ],
  providers: [ParametersService, OutcomesService, CalibrationService, DealsService],
  exports: [ParametersService, OutcomesService, CalibrationService, DealsService],
})
export class CalibrationModule {}
