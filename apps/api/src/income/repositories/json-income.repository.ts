import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { DATA_DIR } from '../../shared/providers/paths';
import type { IncomeRepository, IncomeStatement, OneOffIncome } from '../domain/income.repository';

@Injectable()
export class JsonIncomeRepository implements IncomeRepository {
  private readonly store: JsonStore<IncomeStatement> = createJsonStore<IncomeStatement>(
    path.join(DATA_DIR, 'income.json'),
    { recurringMonthly: null, oneOffs: [] },
  );

  get(): Promise<IncomeStatement> {
    return this.store.read();
  }

  async setRecurring(amount: number): Promise<void> {
    const data = await this.store.read();
    data.recurringMonthly = amount;
    await this.store.write(data);
  }

  async addOneOff(entry: OneOffIncome): Promise<void> {
    const data = await this.store.read();
    data.oneOffs.push(entry);
    await this.store.write(data);
  }
}
