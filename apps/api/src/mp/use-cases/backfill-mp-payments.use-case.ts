import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import { isMpTokenExpired } from '../../users/domain/user';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../../users/domain/users.repository';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import {
  BACKFILL_SUMMARIES_REPOSITORY,
  type BackfillSummariesRepository,
} from '../../proactive/domain/backfill-summaries.repository';
import type { BackfillSummary } from '../../proactive/domain/backfill-summary';
import {
  PENDING_PROMPTS_REPOSITORY,
  type PendingPromptsRepository,
} from '../../proactive/domain/pending-prompts.repository';
import {
  MP_PAYMENTS_SEARCH_GATEWAY,
  type MpPaymentsSearchGateway,
} from '../domain/mp-payments-search.gateway';
import {
  MP_POLL_CURSORS_REPOSITORY,
  type MpPollCursorsRepository,
} from '../domain/mp-poll-cursors.repository';
import {
  BATCH_CLASSIFIER,
  type BatchClassifier,
} from '../domain/batch-classifier';
import {
  MP_USER_LOOKUP_GATEWAY,
  type MpUserLookupGateway,
} from '../domain/mp-user-lookup.gateway';
import {
  backfillScopeDurationMs,
  type BackfillScope,
} from '../domain/backfill-scope';
import {
  isAcceptedOperationType,
  normalizeOperationType,
  type OperationType,
} from '../domain/operation-type';
import type { MpPayment } from '../domain/mp-payment';
import { merchantOf, payerNameOf, paymentDirection } from '../domain/mp-payment-extract';
import { RefreshMpToken } from './refresh-mp-token.use-case';

// Same skew as PollMpPayments — keep the two pipelines consistent.
const TOKEN_REFRESH_SKEW_MS = 2 * 60_000;

// Below this confidence we force the category to `otros` and mark the
// transaction `needsReview=true` so the user can audit it.
const LOW_CONFIDENCE = 0.4;

export interface BackfillMpPaymentsInput {
  readonly userId: string;
  readonly scope: BackfillScope;
}

/**
 * Imports the MP movements from [now - scope, now] into the user's
 * transactions in one shot (spec §6 — backfill flow). Skips `account_fund`,
 * classifies the rest in a single batch call, marks low-confidence rows for
 * review, persists a BackfillSummary, and advances the poll cursor to `now`.
 *
 * Returns the persisted BackfillSummary so the HTTP layer can echo it back —
 * this flow is synchronous and user-initiated, so the response carries the
 * summary directly (no proactive bus channel needed).
 */
@Injectable()
export class BackfillMpPayments {
  private readonly log = new Logger(BackfillMpPayments.name);

  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(MP_POLL_CURSORS_REPOSITORY)
    private readonly cursors: MpPollCursorsRepository,
    @Inject(MP_PAYMENTS_SEARCH_GATEWAY)
    private readonly gateway: MpPaymentsSearchGateway,
    @Inject(BATCH_CLASSIFIER)
    private readonly batchClassifier: BatchClassifier,
    @Inject(TRANSACTIONS_REPOSITORY)
    private readonly transactions: TransactionsRepository,
    @Inject(BACKFILL_SUMMARIES_REPOSITORY)
    private readonly summaries: BackfillSummariesRepository,
    @Inject(PENDING_PROMPTS_REPOSITORY)
    private readonly prompts: PendingPromptsRepository,
    @Inject(MP_USER_LOOKUP_GATEWAY)
    private readonly userLookup: MpUserLookupGateway,
    private readonly refreshToken: RefreshMpToken,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: BackfillMpPaymentsInput): Promise<BackfillSummary> {
    let user = await this.users.getById(input.userId);
    if (!user.mpUserId || !user.mpAccessToken) {
      throw new Error('User is not connected to Mercado Pago');
    }

    if (isMpTokenExpired(user, TOKEN_REFRESH_SKEW_MS)) {
      await this.refreshToken.execute(user); // refresh returns the new token but mutates persistently
      user = await this.users.getById(input.userId); // re-fetch to pick up rotated tokens
    }
    const accessToken = user.mpAccessToken as string;

    const end = this.clock.now();
    const begin = new Date(end.getTime() - backfillScopeDurationMs(input.scope));

    const { results, truncated } = await this.gateway.search({
      accessToken,
      beginDate: begin,
      endDate: end,
    });

    // Drop `account_fund` (internal wallet top-ups) before doing any work.
    const filtered = results.filter((p) => isAcceptedOperationType(p.operation_type));

    // Dedupe against existing transactions — backfilling a window already
    // partially covered by the cron poller (or running backfill twice) must
    // not create duplicate transactions for the same mpPaymentId. Shared
    // invariant with `ProcessMpEvent`.
    const fresh: MpPayment[] = [];
    for (const p of filtered) {
      const found = await this.transactions.findByMpPaymentId(user.id, String(p.id));
      if (!found) fresh.push(p);
    }

    // Also dedupe against pending prompts — if the cron poller already
    // queued a payment for user review (status='pending'), the backfill
    // must NOT import it as a transaction. Otherwise, accepting the prompt
    // afterwards would create a duplicate. Respect the user's active
    // decision queue and let them complete that path.
    const trulyFresh: MpPayment[] = [];
    for (const p of fresh) {
      const existingPrompt = await this.prompts.findByMpPaymentId(user.id, String(p.id));
      if (!existingPrompt || existingPrompt.status !== 'pending') {
        trulyFresh.push(p);
      }
    }

    const byOperationType: Record<OperationType, number> = {
      regular_payment: 0,
      money_transfer: 0,
      recurring_payment: 0,
      account_fund: 0, // always 0 — filtered above; tracked for shape stability.
    };

    let lowConfidenceCount = 0;

    if (trulyFresh.length > 0) {
      const classifications = await this.batchClassifier.classifyBatch({
        user,
        payments: trulyFresh,
      });

      // Map per-index — the contract guarantees same order as input.
      for (let i = 0; i < trulyFresh.length; i++) {
        const payment = trulyFresh[i];
        const classification = classifications[i];
        if (!classification) {
          this.log.warn(
            `BackfillMpPayments: missing classification for payment ${payment.id}`,
          );
          continue;
        }

        const lowConfidence = classification.confidence < LOW_CONFIDENCE;
        if (lowConfidence) lowConfidenceCount += 1;

        const opType = normalizeOperationType(payment.operation_type);
        byOperationType[opType] += 1;

        const direction: 'income' | 'expense' = paymentDirection(payment, user);
        const merchant = merchantOf(payment) ?? 'Mercado Pago';
        const date = dateOf(payment, end);
        // Counterparty resolution:
        //   - Income: payer name (or email-local-part fallback).
        //   - Outgoing peer transfer: MP hides the recipient's name in the
        //     `collector` block, but the public `/users/{id}` endpoint
        //     exposes a nickname. Lookup is cached, so backfilling N
        //     transfers to the same recipient costs one round-trip.
        //   - Outgoing payment to a commerce: merchant already conveys it,
        //     so we skip the lookup and leave counterparty null.
        let counterparty: string | null = null;
        if (direction === 'income') {
          counterparty = payerNameOf(payment);
        } else if (opType === 'money_transfer' && payment.collector?.id) {
          counterparty = await this.userLookup.lookupNickname(
            String(payment.collector.id),
            accessToken,
          );
        }

        await this.transactions.create({
          userId: user.id,
          amount: payment.transaction_amount,
          category: lowConfidence ? 'otros' : classification.category,
          description: classification.suggestedDescription,
          merchant,
          date,
          direction,
          source: 'mercadopago',
          mpPaymentId: String(payment.id),
          needsReview: lowConfidence,
          operationType: opType,
          counterparty,
        });
      }
    }

    const totalImported = trulyFresh.length;

    const summary = await this.summaries.create({
      userId: user.id,
      scope: input.scope,
      rangeBegin: begin,
      rangeEnd: end,
      totalImported,
      byOperationType,
      lowConfidenceCount,
      truncated,
      status: 'visible',
    });

    await this.cursors.upsert({ userId: user.id, lastPolledAt: end });

    return summary;
  }
}

/** Picks a YYYY-MM-DD date string from the payment, falling back to `end`. */
function dateOf(p: MpPayment, fallback: Date): string {
  const iso = p.date_approved ?? p.date_created ?? fallback.toISOString();
  return iso.slice(0, 10);
}
