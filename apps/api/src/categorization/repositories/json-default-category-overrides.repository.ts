import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { DATA_DIR } from '../../shared/providers/paths';
import type {
  DefaultCategoryOverrides,
  DefaultCategoryOverridesRepository,
} from '../../shared/domain/default-category-overrides';

@Injectable()
export class JsonDefaultCategoryOverridesRepository implements DefaultCategoryOverridesRepository {
  private readonly store: JsonStore<DefaultCategoryOverrides>;

  constructor(filePath?: string) {
    this.store = createJsonStore<DefaultCategoryOverrides>(
      filePath ?? path.join(DATA_DIR, 'default-category-overrides.json'),
      {},
    );
  }

  all(): Promise<DefaultCategoryOverrides> {
    return this.store.read();
  }

  async set(name: string, description: string): Promise<void> {
    const data = await this.store.read();
    data[name] = description;
    await this.store.write(data);
  }

  async reset(name: string): Promise<void> {
    const data = await this.store.read();
    if (!(name in data)) return;
    delete data[name];
    await this.store.write(data);
  }
}
