import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../shared/domain/domain-error';
import { GOALS_REPOSITORY, type GoalsRepository } from '../domain/goals.repository';

export interface ClearGoalInput {
  goalId: string;
}

@Injectable()
export class ClearGoal {
  constructor(@Inject(GOALS_REPOSITORY) private readonly repo: GoalsRepository) {}

  async execute(input: ClearGoalInput) {
    const ok = await this.repo.delete(input.goalId);
    if (!ok) throw new DomainError('NOT_FOUND', `Objetivo ${input.goalId} no encontrado.`);
    return { goalId: input.goalId, cleared: true };
  }
}
