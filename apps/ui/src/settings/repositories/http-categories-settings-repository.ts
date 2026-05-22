import type { CategoryWithDescription } from '../domain/category-with-description';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export class HttpCategoriesSettingsRepository {
  async list(): Promise<CategoryWithDescription[]> {
    const res = await fetch(`${API_BASE}/categorization/list-categories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error(`list-categories ${res.status}`);
    return (await res.json()).categories as CategoryWithDescription[];
  }

  async updateDescription(name: string, description: string): Promise<CategoryWithDescription> {
    const res = await fetch(`${API_BASE}/categorization/update-description`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) throw new Error(`update-description ${res.status}`);
    const updated = await res.json();
    return { ...updated, isCustom: false } as CategoryWithDescription;
  }

  async resetDescription(name: string): Promise<CategoryWithDescription> {
    const res = await fetch(`${API_BASE}/categorization/reset-description`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`reset-description ${res.status}`);
    const updated = await res.json();
    return { ...updated, isCustom: false } as CategoryWithDescription;
  }
}
