import { Injectable } from '@nestjs/common';
import path from 'node:path';
import { createJsonStore, type JsonStore } from '../../shared/providers/json-store';
import { DATA_DIR } from '../../shared/providers/paths';
import {
  EMPTY_CUSTOM_CATEGORIES,
  type CategoriesRepository,
  type CustomCategories,
  type CustomCategoryDefinition,
} from '../../shared/domain/custom-categories';

/**
 * Lazy migration on read: an existing `custom-categories.json` from before this
 * feature is a `string[]`; we normalize each entry to `{ name, description: '' }`
 * so callers always see the new shape. The first write persists the new format.
 *
 * `filePath` is overridable for tests; production uses DATA_DIR.
 */
@Injectable()
export class JsonCategoriesRepository implements CategoriesRepository {
  private readonly store: JsonStore<unknown[]>;

  constructor(filePath?: string) {
    this.store = createJsonStore<unknown[]>(
      filePath ?? path.join(DATA_DIR, 'custom-categories.json'),
      [...EMPTY_CUSTOM_CATEGORIES],
    );
  }

  private normalize(raw: unknown[]): CustomCategories {
    return raw
      .map((entry) => {
        if (typeof entry === 'string') return { name: entry, description: '' };
        const e = entry as { name?: string; description?: string };
        return { name: String(e.name ?? ''), description: String(e.description ?? '') };
      })
      .filter((e): e is CustomCategoryDefinition => e.name.length > 0);
  }

  async all(): Promise<CustomCategories> {
    return this.normalize(await this.store.read());
  }

  async add(name: string, description: string): Promise<void> {
    const data = await this.all();
    if (data.some((c) => c.name === name)) return;
    data.push({ name, description });
    await this.store.write(data);
  }

  async remove(name: string): Promise<void> {
    const data = await this.all();
    await this.store.write(data.filter((c) => c.name !== name));
  }

  async rename(from: string, to: string): Promise<void> {
    const data = await this.all();
    await this.store.write(
      data.map((c) => (c.name === from ? { name: to, description: c.description } : c)),
    );
  }

  async setDescription(name: string, description: string): Promise<void> {
    const data = await this.all();
    if (!data.some((c) => c.name === name)) return;
    await this.store.write(data.map((c) => (c.name === name ? { name: c.name, description } : c)));
  }
}
