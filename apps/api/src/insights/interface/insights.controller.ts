import { Body, Controller, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../shared/interface/zod-validation.pipe';
import { ProjectMonthEnd, type ProjectMonthEndInput } from '../use-cases/project-month-end.use-case';
import {
  DetectRecurringCharges,
  type RecurringChargesInput,
} from '../use-cases/recurring-charges.use-case';
import { DetectCategorySpikes } from '../use-cases/category-spikes.use-case';
import { categorySpikesInput, projectMonthEndInput, recurringChargesInput } from './insights.schemas';

@Controller('insights')
export class InsightsController {
  constructor(
    private readonly project: ProjectMonthEnd,
    private readonly recurring: DetectRecurringCharges,
    private readonly spikes: DetectCategorySpikes,
  ) {}

  @Post('project-month-end')
  projectMonthEnd(@Body(new ZodValidationPipe(projectMonthEndInput)) body: ProjectMonthEndInput) {
    return this.project.execute(body);
  }

  @Post('recurring-charges')
  recurringCharges(@Body(new ZodValidationPipe(recurringChargesInput)) body: RecurringChargesInput) {
    return this.recurring.execute(body);
  }

  @Post('category-spikes')
  categorySpikes(@Body(new ZodValidationPipe(categorySpikesInput)) _body: Record<string, never>) {
    return this.spikes.execute();
  }
}
