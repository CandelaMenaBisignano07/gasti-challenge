import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import type { ClassifyArgs, PaymentClassifier } from '../domain/payment-classifier';
import { FALLBACK_CLASSIFICATION } from '../domain/payment-classifier';
import type { Classification } from '../domain/classification';
import { categorySchema } from '../../shared/domain/category';

const AI_BASE = process.env.AI_BASE_URL?.trim() || 'http://localhost:4111';

/** Validates the `apps/ai` workflow result against the `Classification` shape. */
const classificationSchema = z.object({
  category: categorySchema,
  suggestedDescription: z.string(),
  confidence: z.number().min(0).max(1),
});

/** Calls the apps/ai `classify-mp-event` workflow; falls back on any failure. */
@Injectable()
export class HttpPaymentClassifier implements PaymentClassifier {
  private readonly log = new Logger(HttpPaymentClassifier.name);

  async classify(args: ClassifyArgs): Promise<Classification> {
    // args.user is reserved for the in-flight per-user categories feature;
    // intentionally not sent to apps/ai until that feature lands (spec §10b).
    const { user: _user, ...payload } = args;
    try {
      return await this.attempt(payload);
    } catch {
      await new Promise((r) => setTimeout(r, 500));
      try {
        return await this.attempt(payload);
      } catch (err) {
        this.log.warn(`classifier unreachable, using fallback: ${String(err)}`);
        return FALLBACK_CLASSIFICATION(args.merchant);
      }
    }
  }

  private async attempt(payload: Omit<ClassifyArgs, 'user'>): Promise<Classification> {
    // Route + envelope confirmed in Phase 3 (Task 3.5) against the Mastra server.
    const res = await fetch(`${AI_BASE}/api/workflows/classify-mp-event/start-async`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inputData: payload }),
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
    return parsed.data;
  }
}
