import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { DATA_DIR } from '../../shared/providers/paths';
import type { Category } from '../../shared/domain/category';
import type { BudgetsRepository } from '../domain/budgets.repository';

type BudgetsData = Record<string, Record<string, number>>;

@Injectable()
export class JsonBudgetsRepository implements BudgetsRepository {
  private readonly store: JsonStore<BudgetsData> = createJsonStore<BudgetsData>(
    path.join(DATA_DIR, 'budgets.json'),
    {},
  );

  async forMonth(month: string): Promise<Partial<Record<Category, number>>> {
    return ((await this.store.read())[month] ?? {}) as Partial<Record<Category, number>>;
  }

  async set(month: string, category: Category, amount: number): Promise<void> {
    const data = await this.store.read();
    data[month] = { ...(data[month] ?? {}), [category]: amount };
    await this.store.write(data);
  }

  async clear(month: string, category: Category): Promise<void> {
    const data = await this.store.read();
    if (data[month]) delete data[month][category];
    await this.store.write(data);
  }
}
