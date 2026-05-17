import { Inject, Injectable } from '@nestjs/common';
import type { Category } from '../domain/category';
import {
  CATEGORIZATION_REPOSITORY,
  type CategorizationRepository,
} from '../domain/category-overrides';
import type { Transaction } from '../domain/transaction';

@Injectable()
export class CategoryResolver {
  constructor(
    @Inject(CATEGORIZATION_REPOSITORY) private readonly repo: CategorizationRepository,
  ) {}

  /** Effective category for every transaction, keyed by id. Reads overrides once. */
  async resolveAll(txs: Transaction[]): Promise<Map<string, Category>> {
    const o = await this.repo.overrides();
    const map = new Map<string, Category>();
    for (const tx of txs) {
      map.set(tx.id, o.transactions[tx.id] ?? o.merchants[tx.merchant] ?? tx.category);
    }
    return map;
  }

  /** The merchant-level rule for a merchant, or null if none. */
  async categoryForMerchant(merchant: string): Promise<Category | null> {
    const o = await this.repo.overrides();
    return o.merchants[merchant] ?? null;
  }
}
