import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { categorySchema } from '../../shared/domain/category';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { CategoryDescriptionResolver } from '../../shared/providers/category-description-resolver';
import {
  FALLBACK_CLASSIFICATION,
  type ClassifyArgs,
  type Classification,
  type TransactionClassifier,
} from '../domain/transaction-classifier';

const AI_BASE = process.env.AI_BASE_URL?.trim() || 'http://localhost:4111';

/** Mirrors the Mastra workflow's `classificationResult` schema. */
const classificationSchema = z.object({
  category: categorySchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(160).optional(),
});

/**
 * HTTP client for the `classify-transaction` Mastra workflow.
 *
 * One retry at 500ms; on persistent failure or invalid response, returns the
 * fallback classification (otros / confidence 0) so AddTransaction never
 * throws because the classifier is unreachable.
 *
 * Defense in depth: if the LLM returns a category that is not in the user's
 * registry, coerce to the fallback to avoid persisting a phantom category.
 */
@Injectable()
export class HttpTransactionClassifier implements TransactionClassifier {
  private readonly log = new Logger(HttpTransactionClassifier.name);

  constructor(
    private readonly registry: CategoryRegistry,
    private readonly descriptions: CategoryDescriptionResolver,
  ) {}

  async classify(args: ClassifyArgs): Promise<Classification> {
    const categories = (await this.descriptions.resolveAll()).map(({ name, description }) => ({
      name,
      description,
    }));
    const payload = { inputData: { ...args, categories } };

    try {
      return await this.attempt(payload);
    } catch {
      await new Promise((r) => setTimeout(r, 500));
      try {
        return await this.attempt(payload);
      } catch (err) {
        this.log.warn(`classifier unreachable, using fallback: ${String(err)}`);
        return FALLBACK_CLASSIFICATION;
      }
    }
  }

  private async attempt(payload: unknown): Promise<Classification> {
    const res = await fetch(`${AI_BASE}/api/workflows/classify-transaction/start-async`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`classifier HTTP ${res.status}`);
    const json = (await res.json()) as { status?: string; result?: unknown };
    if (json.status !== 'success' || !json.result) {
      throw new Error('classifier returned no result');
    }
    const parsed = classificationSchema.safeParse(json.result);
    if (!parsed.success) {
      throw new Error(`classifier returned an invalid result: ${parsed.error.message}`);
    }
    if (!(await this.registry.exists(parsed.data.category))) {
      this.log.warn(
        `classifier returned unknown category "${parsed.data.category}", coercing to fallback`,
      );
      return FALLBACK_CLASSIFICATION;
    }
    if (parsed.data.reasoning) this.log.debug(`classifier reasoning: ${parsed.data.reasoning}`);
    return parsed.data;
  }
}
