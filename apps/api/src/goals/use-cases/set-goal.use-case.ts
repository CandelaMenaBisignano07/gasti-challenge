import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { formatIso } from '../../shared/domain/dates';
import type { Category } from '../../shared/domain/category';
import type { Goal } from '../../shared/domain/goal';
import { GOALS_REPOSITORY, type GoalsRepository } from '../domain/goals.repository';

export interface SetGoalInput {
  name: string;
  targetAmount: number;
  targetDate: string;
  linkedCategory?: Category;
}

@Injectable()
export class SetGoal {
  constructor(
    @Inject(GOALS_REPOSITORY) private readonly repo: GoalsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: SetGoalInput): Promise<{ goal: Goal }> {
    const goal = await this.repo.upsertByName(
      {
        name: input.name,
        targetAmount: input.targetAmount,
        targetDate: input.targetDate,
        linkedCategory: input.linkedCategory ?? null,
      },
      formatIso(this.clock.now()),
    );
    return { goal };
  }
}
