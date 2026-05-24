import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/providers/clock';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import { UpdateTransactionStatus } from '../../transactions/use-cases/update-transaction-status.use-case';
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
import { PAYMENT_CLASSIFIER, type PaymentClassifier } from '../domain/payment-classifier';
import {
  MP_USER_LOOKUP_GATEWAY,
  type MpUserLookupGateway,
} from '../domain/mp-user-lookup.gateway';
import { isCompletedPayment } from '../domain/is-completed-payment';
import { classifyMpStatusChange } from '../domain/classify-mp-status-change';
import { normalizeOperationType } from '../domain/operation-type';
import type { MpPayment } from '../domain/mp-payment';
import {
  merchantOf,
  payerNameOf,
  paymentDirection,
} from '../domain/mp-payment-extract';
import type { User } from '../../users/domain/user';

export interface ProcessMpEventInput {
  readonly payment: MpPayment;
  readonly user: User;
}

/**
 * Orchestrates a single Mercado Pago payment event into proactive state
 * (spec §5). Caller (PollMpPayments) hydrates the payment + resolves the
 * account; this use-case dispatches one of three branches: reversal of an
 * existing tx, refund-before-prompt, or a brand-new completed payment.
 * Idempotent: dedupes on the transactions and pending-prompts repositories
 * before any insert.
 */
@Injectable()
export class ProcessMpEvent {
  private readonly log = new Logger(ProcessMpEvent.name);

  constructor(
    @Inject(PAYMENT_CLASSIFIER) private readonly classifier: PaymentClassifier,
    @Inject(TRANSACTIONS_REPOSITORY) private readonly transactions: TransactionsRepository,
    @Inject(PENDING_PROMPTS_REPOSITORY) private readonly prompts: PendingPromptsRepository,
    @Inject(PROACTIVE_EVENT_BUS) private readonly bus: ProactiveEventBus,
    @Inject(MP_USER_LOOKUP_GATEWAY) private readonly userLookup: MpUserLookupGateway,
    private readonly updateStatus: UpdateTransactionStatus,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ payment, user }: ProcessMpEventInput): Promise<void> {
    const paymentId = String(payment.id);
    const existingTx = await this.transactions.findByMpPaymentId(user.id, paymentId);
    const change = classifyMpStatusChange(payment);

    // BRANCH 1 — the payment already exists as a transaction.
    if (existingTx) {
      if (!change) return;
      if (
        change.newTransactionStatus === existingTx.status &&
        change.newStatusDetail === existingTx.statusDetail
      ) return;

      await this.updateStatus.execute({
        transactionId: existingTx.id,
        newStatus: change.newTransactionStatus,
        newStatusDetail: change.newStatusDetail,
      });

      const notice = await this.prompts.create(
        this.draftPrompt({
          userId: user.id,
          mpPaymentId: `${paymentId}:${change.noticeReason}`,
          kind: existingTx.direction,
          payment,
          intent: 'notice',
          status: 'auto',
          noticeReason: change.noticeReason,
          suggestedCategory: existingTx.category,
          suggestedDescription: existingTx.description,
          merchant: existingTx.merchant,
          counterparty: existingTx.counterparty,
          confidence: 1,
        }),
      );
      this.bus.publish(user.id, notice);
      return;
    }

    // BRANCH 2 — no transaction and the payment is not completed.
    if (!isCompletedPayment(payment)) {
      if (change?.invalidatesPrompt) {
        const pending = await this.prompts.findByMpPaymentId(user.id, paymentId);
        if (pending) {
          await this.prompts.markDiscarded(pending.id, change.noticeReason);
          const updated = await this.prompts.getById(user.id, pending.id);
          if (updated) this.bus.publish(user.id, updated);
        }
      }
      return;
    }

    // BRANCH 3 — no transaction and the payment is completed: a new movement.
    const duplicate = await this.prompts.findByMpPaymentId(user.id, paymentId);
    if (duplicate) return; // idempotent on MP retries.

    const kind: PaymentKind = paymentDirection(payment, user);
    const merchant = merchantOf(payment);
    // Counterparty resolution mirrors BackfillMpPayments:
    //   - Income: payer name / email-local fallback.
    //   - Outgoing peer transfer: nickname lookup on /users/{collector.id},
    //     cached in the gateway across calls.
    //   - Outgoing commerce: null (merchant already conveys it).
    let counterparty: string | null = null;
    if (kind === 'income') {
      counterparty = payerNameOf(payment);
    } else if (
      payment.operation_type === 'money_transfer' &&
      payment.collector?.id &&
      user.mpAccessToken
    ) {
      counterparty = await this.userLookup.lookupNickname(
        String(payment.collector.id),
        user.mpAccessToken,
      );
    }
    // Classifier sees the most informative counterparty available: same
    // value we just computed for persistence (payer name for income,
    // recipient nickname for outgoing transfer, merchant otherwise).
    const classifierCounterparty = counterparty ?? merchant;

    const classification = await this.classifier.classify({
      user,
      kind,
      amount: payment.transaction_amount,
      merchant,
      description: payment.description ?? null,
      counterparty: classifierCounterparty,
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
        counterparty,
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
    counterparty: string | null;
    confidence: number;
  }): NewPendingPrompt {
    const now = this.clock.now().toISOString();
    const paymentDate =
      args.payment.date_approved ?? args.payment.date_created ?? now;
    return {
      userId: args.userId,
      mpPaymentId: args.mpPaymentId,
      kind: args.kind,
      amount: args.payment.transaction_amount,
      merchant: args.merchant,
      counterparty: args.counterparty,
      paymentDate,
      suggestedCategory: args.suggestedCategory,
      suggestedDescription: args.suggestedDescription,
      operationType: normalizeOperationType(args.payment.operation_type),
      confidence: args.confidence,
      intent: args.intent,
      noticeReason: args.noticeReason,
      status: args.status,
      createdAt: now,
    };
  }
}
