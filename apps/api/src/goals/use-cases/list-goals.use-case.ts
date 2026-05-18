import { Inject, Injectable } from '@nestjs/common';
import type { Goal } from '../../shared/domain/goal';
import { GOALS_REPOSITORY, type GoalsRepository } from '../domain/goals.repository';

@Injectable()
export class ListGoals {
  constructor(@Inject(GOALS_REPOSITORY) private readonly repo: GoalsRepository) {}

  async execute(): Promise<{ goals: Goal[] }> {
    return { goals: await this.repo.all() };
  }
}
