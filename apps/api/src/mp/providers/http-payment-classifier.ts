import { Injectable, Logger } from '@nestjs/common';
import type { ClassifyArgs, PaymentClassifier } from '../domain/payment-classifier';
import { FALLBACK_CLASSIFICATION } from '../domain/payment-classifier';
import type { Classification } from '../domain/classification';

const AI_BASE = process.env.AI_BASE_URL?.trim() || 'http://localhost:4111';

/** Calls the apps/ai `classify-mp-event` workflow; falls back on any failure. */
@Injectable()
export class HttpPaymentClassifier implements PaymentClassifier {
  private readonly log = new Logger(HttpPaymentClassifier.name);

  async classify(args: ClassifyArgs): Promise<Classification> {
    try {
      return await this.attempt(args);
    } catch {
      await new Promise((r) => setTimeout(r, 500));
      try {
        return await this.attempt(args);
      } catch (err) {
        this.log.warn(`classifier unreachable, using fallback: ${String(err)}`);
        return FALLBACK_CLASSIFICATION(args.merchant);
      }
    }
  }

  private async attempt(args: ClassifyArgs): Promise<Classification> {
    // Route + envelope confirmed in Phase 3 (Task 3.5) against the Mastra server.
    const res = await fetch(`${AI_BASE}/api/workflows/classify-mp-event/start-async`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inputData: args }),
    });
    if (!res.ok) throw new Error(`classifier HTTP ${res.status}`);
    const json = (await res.json()) as { status?: string; result?: Classification };
    if (json.status !== 'success' || !json.result) {
      throw new Error('classifier returned no result');
    }
    return json.result;
  }
}
