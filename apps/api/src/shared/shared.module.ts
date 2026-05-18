import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from './providers/clock';
import { PeriodResolver } from './providers/period-resolver';
import { CategoryResolver } from './providers/category-resolver';
import { CategoryRegistry } from './providers/category-registry';
import { CATEGORIZATION_REPOSITORY } from './domain/category-overrides';
import { CATEGORIES_REPOSITORY } from './domain/custom-categories';
import { JsonCategorizationRepository } from '../categorization/repositories/json-categorization.repository';
import { JsonCategoriesRepository } from '../categorization/repositories/json-categories.repository';

@Global()
@Module({
  providers: [
    { provide: CLOCK, useValue: systemClock },
    PeriodResolver,
    CategoryResolver,
    CategoryRegistry,
    { provide: CATEGORIZATION_REPOSITORY, useClass: JsonCategorizationRepository },
    { provide: CATEGORIES_REPOSITORY, useClass: JsonCategoriesRepository },
  ],
  exports: [
    CLOCK,
    PeriodResolver,
    CategoryResolver,
    CategoryRegistry,
    CATEGORIZATION_REPOSITORY,
    CATEGORIES_REPOSITORY,
  ],
})
export class SharedModule {}
