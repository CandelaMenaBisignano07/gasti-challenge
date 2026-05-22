import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import type {
  BatchClassifier,
  BatchClassifyArgs,
} from '../domain/batch-classifier';
import type { Classification } from '../domain/classification';
import type { MpPayment } from '../domain/mp-payment';
import { categorySchema } from '../../shared/domain/category';

const AI_BASE = process.env.AI_BASE_URL?.trim() || 'http://localhost:4111';

const classificationSchema = z.object({
  category: categorySchema,
  suggestedDescription: z.string(),
  confidence: z.number().min(0).max(1),
});

const responseSchema = z.object({
  classifications: z.array(classificationSchema),
});

/** Per-payment payload shape consumed by the apps/ai `classify-batch` workflow. */
interface ClassifyMpEventInput {
  readonly kind: 'income' | 'expense';
  readonly amount: number;
  readonly merchant: string | null;
  readonly description: string | null;
  readonly counterparty: string | null;
}

/**
 * Calls the apps/ai `classify-batch` Mastra workflow (T13). Used by the
 * backfill use-case to classify the entire MP search window in one round-trip.
 * Throws on any failure — the caller decides how to surface a backfill error
 * (the per-event classifier has its own fallback path, this one doesn't).
 */
@Injectable()
export class HttpBatchClassifier implements BatchClassifier {
  private readonly log = new Logger(HttpBatchClassifier.name);

  async classifyBatch(args: BatchClassifyArgs): Promise<Classification[]> {
    // args.user is reserved for the in-flight per-user categories feature —
    // intentionally not forwarded to apps/ai until that lands (spec §10b,
    // matches HttpPaymentClassifier).
    const payments = args.payments.map((p) => toClassifyInput(p, args.user.mpUserId));

    const res = await fetch(
      `${AI_BASE}/api/workflows/classify-batch/start-async`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inputData: { payments } }),
      },
    );
    if (!res.ok) {
      throw new Error(`batch classifier HTTP ${res.status}`);
    }
    const json = (await res.json()) as { status?: string; result?: unknown };
    if (json.status !== 'success' || !json.result) {
      this.log.warn(`batch classifier returned non-success: ${JSON.stringify(json)}`);
      throw new Error('batch classifier returned no result');
    }
    const parsed = responseSchema.safeParse(json.result);
    if (!parsed.success) {
      throw new Error(
        `batch classifier returned an invalid result: ${parsed.error.message}`,
      );
    }
    return parsed.data.classifications;
  }
}

function toClassifyInput(p: MpPayment, mpUserId: string | null): ClassifyMpEventInput {
  const kind: 'income' | 'expense' =
    p.collector_id === Number(mpUserId) ? 'income' : 'expense';
  const merchant = merchantOf(p);
  const counterparty = kind === 'income' ? payerNameOf(p) : merchant;
  return {
    kind,
    amount: p.transaction_amount,
    merchant,
    description: p.description ?? null,
    counterparty,
  };
}

function merchantOf(p: MpPayment): string | null {
  const itemTitle = p.additional_info?.items?.[0]?.title;
  return itemTitle ?? p.description ?? null;
}

function payerNameOf(p: MpPayment): string | null {
  const name = [p.payer?.first_name, p.payer?.last_name]
    .filter((s): s is string => Boolean(s))
    .join(' ')
    .trim();
  return name.length > 0 ? name : null;
}
