import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { DATA_DIR } from '../../shared/providers/paths';
import type { Goal } from '../../shared/domain/goal';
import type { GoalDraft, GoalsRepository } from '../domain/goals.repository';

@Injectable()
export class JsonGoalsRepository implements GoalsRepository {
  private readonly store: JsonStore<Goal[]> = createJsonStore<Goal[]>(
    path.join(DATA_DIR, 'goals.json'),
    [],
  );

  all(): Promise<Goal[]> {
    return this.store.read();
  }

  async getById(id: string): Promise<Goal | null> {
    return (await this.store.read()).find((g) => g.id === id) ?? null;
  }

  async upsertByName(draft: GoalDraft, createdAt: string): Promise<Goal> {
    const goals = await this.store.read();
    const index = goals.findIndex((g) => g.name.toLowerCase() === draft.name.toLowerCase());
    let goal: Goal;
    if (index >= 0) {
      goal = { ...goals[index], ...draft };
      goals[index] = goal;
    } else {
      const max = goals.reduce((m, g) => {
        const n = Number(g.id.replace(/\D/g, ''));
        return Number.isFinite(n) && n > m ? n : m;
      }, 0);
      goal = { id: `goal_${String(max + 1).padStart(3, '0')}`, createdAt, ...draft };
      goals.push(goal);
    }
    await this.store.write(goals);
    return goal;
  }

  async delete(id: string): Promise<boolean> {
    const goals = await this.store.read();
    const next = goals.filter((g) => g.id !== id);
    if (next.length === goals.length) return false;
    await this.store.write(next);
    return true;
  }
}
