import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../../users/domain/users.repository';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import { MarkTransactionReversed } from '../../transactions/use-cases/mark-transaction-reversed.use-case';
import {
  PENDING_PROMPTS_REPOSITORY,
  type PendingPromptsRepository,
} from '../../proactive/domain/pending-prompts.repository';
import {
  PROACTIVE_EVENT_BUS,
  type ProactiveEventBus,
} from '../../proactive/domain/proactive-event-bus';
import type { NoticeReason, PaymentKind } from '../../proactive/domain/pending-prompt';
import type { NewPendingPrompt } from '../../proactive/domain/pending-prompts.repository';
import { MP_PAYMENT_SOURCE, type MpPaymentSource } from '../domain/mp-payment-source';
import { PAYMENT_CLASSIFIER, type PaymentClassifier } from '../domain/payment-classifier';
import { isCompletedPayment } from '../domain/is-completed-payment';
import { mapMpStatusToTransactionStatus } from '../domain/map-mp-status';
import type { MpPayment } from '../domain/mp-payment';

export interface ProcessMpEventInput {
  readonly paymentId: string;
  readonly mpUserId: string;
}

/**
 * Orchestrates a Mercado Pago webhook event into proactive state (spec §5).
 * Resolves the account, fetches the payment, then dispatches one of three
 * branches: reversal of an existing tx, refund-before-prompt, or a brand-new
 * completed payment. Idempotent: dedupes on the transactions and
 * pending-prompts repositories before any insert.
 */
@Injectable()
export class ProcessMpEvent {
  private readonly log = new Logger(ProcessMpEvent.name);

  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(MP_PAYMENT_SOURCE) private readonly payments: MpPaymentSource,
    @Inject(PAYMENT_CLASSIFIER) private readonly classifier: PaymentClassifier,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactions: TransactionsRepository,
    @Inject(PENDING_PROMPTS_REPOSITORY) private readonly prompts: PendingPromptsRepository,
    @Inject(PROACTIVE_EVENT_BUS) private readonly bus: ProactiveEventBus,
    private readonly markReversed: MarkTransactionReversed,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ paymentId, mpUserId }: ProcessMpEventInput): Promise<void> {
    const user = await this.users.findByMpUserId(mpUserId);
    if (!user) {
      // Unknown account — pre/post-disconnect race. Drop silently.
      return;
    }

    const existingTx = await this.transactions.findByMpPaymentId(user.id, paymentId);
    const payment = await this.payments.getById(paymentId, user.id);
    const newStatus = mapMpStatusToTransactionStatus(payment.status);

    // BRANCH 1 — the payment already exists as a transaction.
    if (existingTx) {
      if (newStatus === existingTx.status) return; // idempotent: nothing changed.

      await this.markReversed.execute({ transactionId: existingTx.id, newStatus });

      const noticeReason: NoticeReason =
        newStatus === 'charged_back' ? 'mp_chargeback' : 'mp_refund';
      const notice = await this.prompts.create(
        this.draftPrompt({
          userId: user.id,
          mpPaymentId: `${paymentId}:reversal`,
          kind: existingTx.direction,
          payment,
          intent: 'notice',
          status: 'auto',
          noticeReason,
          suggestedCategory: existingTx.category,
          suggestedDescription: existingTx.description,
          merchant: existingTx.merchant,
          confidence: 1,
        }),
      );
      this.bus.publish(user.id, notice);
      return;
    }

    // BRANCH 2 — no transaction and the payment is not completed.
    if (!isCompletedPayment(payment)) {
      const pending = await this.prompts.findByMpPaymentId(user.id, paymentId);
      if (
        pending &&
        (payment.status === 'refunded' || payment.status === 'charged_back')
      ) {
        const reason: NoticeReason =
          payment.status === 'charged_back' ? 'mp_chargeback' : 'mp_refund';
        await this.prompts.markDiscarded(pending.id, reason);
        const updated = await this.prompts.getById(user.id, pending.id);
        if (updated) this.bus.publish(user.id, updated);
      }
      // Otherwise drop (still pending / authorized / rejected).
      return;
    }

    // BRANCH 3 — no transaction and the payment is completed: a new movement.
    const duplicate = await this.prompts.findByMpPaymentId(user.id, paymentId);
    if (duplicate) return; // idempotent on MP retries.

    const kind: PaymentKind =
      payment.collector_id === Number(user.mpUserId) ? 'income' : 'expense';
    const merchant = merchantOf(payment);
    const counterparty = kind === 'income' ? payerNameOf(payment) : merchant;

    const classification = await this.classifier.classify({
      kind,
      amount: payment.transaction_amount,
      merchant,
      description: payment.description ?? null,
      counterparty,
    });

    const prompt = await this.prompts.create(
      this.draftPrompt({
        userId: user.id,
        mpPaymentId: paymentId,
        kind,
        payment,
        intent: 'confirm',
        status: 'pending',
        noticeReason: null,
        suggestedCategory: classification.category,
        suggestedDescription: classification.suggestedDescription,
        merchant,
        confidence: classification.confidence,
      }),
    );
    this.bus.publish(user.id, prompt);
  }

  private draftPrompt(args: {
    userId: string;
    mpPaymentId: string;
    kind: PaymentKind;
    payment: MpPayment;
    intent: NewPendingPrompt['intent'];
    status: NewPendingPrompt['status'];
    noticeReason: NoticeReason | null;
    suggestedCategory: NewPendingPrompt['suggestedCategory'];
    suggestedDescription: string;
    merchant: string | null;
    confidence: number;
  }): NewPendingPrompt {
    const now = this.clock.now().toISOString();
    const paymentDate =
      args.payment.date_approved ?? args.payment.date_created ?? now;
    return {
      id: `pp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      userId: args.userId,
      mpPaymentId: args.mpPaymentId,
      kind: args.kind,
      amount: args.payment.transaction_amount,
      merchant: args.merchant,
      paymentDate,
      suggestedCategory: args.suggestedCategory,
      suggestedDescription: args.suggestedDescription,
      confidence: args.confidence,
      intent: args.intent,
      noticeReason: args.noticeReason,
      status: args.status,
      createdAt: now,
    };
  }
}

/** Derives a human-readable merchant from the MP payment shape. */
function merchantOf(p: MpPayment): string | null {
  const itemTitle = p.additional_info?.items?.[0]?.title;
  return itemTitle ?? p.description ?? null;
}

/** Joins the payer's first and last name when present. */
function payerNameOf(p: MpPayment): string | null {
  const name = [p.payer?.first_name, p.payer?.last_name]
    .filter((s): s is string => Boolean(s))
    .join(' ')
    .trim();
  return name.length > 0 ? name : null;
}
