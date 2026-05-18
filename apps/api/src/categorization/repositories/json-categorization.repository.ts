import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { DATA_DIR } from '../../shared/providers/paths';
import type { Category } from '../../shared/domain/category';
import {
  EMPTY_OVERRIDES,
  type CategorizationRepository,
  type CategoryOverrides,
} from '../../shared/domain/category-overrides';

@Injectable()
export class JsonCategorizationRepository implements CategorizationRepository {
  private readonly store: JsonStore<CategoryOverrides> = createJsonStore<CategoryOverrides>(
    path.join(DATA_DIR, 'category-overrides.json'),
    EMPTY_OVERRIDES,
  );

  overrides(): Promise<CategoryOverrides> {
    return this.store.read();
  }

  async setMerchant(merchant: string, category: Category): Promise<void> {
    const data = await this.store.read();
    data.merchants[merchant] = category;
    await this.store.write(data);
  }

  async setTransaction(transactionId: string, category: Category): Promise<void> {
    const data = await this.store.read();
    data.transactions[transactionId] = category;
    await this.store.write(data);
  }

  async reassignCategory(from: Category, to: Category): Promise<void> {
    const data = await this.store.read();
    for (const m of Object.keys(data.merchants)) {
      if (data.merchants[m] === from) data.merchants[m] = to;
    }
    for (const id of Object.keys(data.transactions)) {
      if (data.transactions[id] === from) data.transactions[id] = to;
    }
    await this.store.write(data);
  }
}
