import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from './providers/clock';
import { PeriodResolver } from './providers/period-resolver';
import { CategoryResolver } from './providers/category-resolver';
import { CATEGORIZATION_REPOSITORY } from './domain/category-overrides';
import { JsonCategorizationRepository } from '../categorization/repositories/json-categorization.repository';

@Global()
@Module({
  providers: [
    { provide: CLOCK, useValue: systemClock },
    PeriodResolver,
    CategoryResolver,
    { provide: CATEGORIZATION_REPOSITORY, useClass: JsonCategorizationRepository },
  ],
  exports: [CLOCK, PeriodResolver, CategoryResolver, CATEGORIZATION_REPOSITORY],
})
export class SharedModule {}
