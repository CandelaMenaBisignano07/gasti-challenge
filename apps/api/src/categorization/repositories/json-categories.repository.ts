import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { DATA_DIR } from '../../shared/providers/paths';
import {
  EMPTY_CUSTOM_CATEGORIES,
  type CategoriesRepository,
  type CustomCategories,
} from '../../shared/domain/custom-categories';

@Injectable()
export class JsonCategoriesRepository implements CategoriesRepository {
  private readonly store: JsonStore<CustomCategories> = createJsonStore<CustomCategories>(
    path.join(DATA_DIR, 'custom-categories.json'),
    EMPTY_CUSTOM_CATEGORIES,
  );

  all(): Promise<CustomCategories> {
    return this.store.read();
  }

  async add(name: string): Promise<void> {
    const data = await this.store.read();
    if (!data.includes(name)) data.push(name);
    await this.store.write(data);
  }

  async remove(name: string): Promise<void> {
    const data = await this.store.read();
    await this.store.write(data.filter((c) => c !== name));
  }

  async rename(from: string, to: string): Promise<void> {
    const data = await this.store.read();
    await this.store.write(data.map((c) => (c === from ? to : c)));
  }
}
