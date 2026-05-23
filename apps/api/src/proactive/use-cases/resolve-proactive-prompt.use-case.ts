import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AddTransaction } from '../../transactions/use-cases/add.use-case';
import { OverrideMerchantCategory } from '../../categorization/use-cases/override-merchant.use-case';
import { CurrentUserProvider } from '../../users/providers/current-user.provider';
import {
  PENDING_PROMPTS_REPOSITORY,
  type PendingPromptsRepository,
} from '../domain/pending-prompts.repository';
import type { PendingPrompt } from '../domain/pending-prompt';
import type { Category } from '../../shared/domain/category';
import type { Transaction } from '../../shared/domain/transaction';

export interface ResolveProactivePromptInput {
  promptId: string;
  action: 'add' | 'discard';
  overrides?: {
    category?: Category;
    description?: string;
    rememberMerchantCategory?: boolean;
  };
}

export interface ResolveProactivePromptResult {
  prompt: PendingPrompt;
  transaction: Transaction | null;
}

@Injectable()
export class ResolveProactivePrompt {
  constructor(
    @Inject(PENDING_PROMPTS_REPOSITORY)
    private readonly prompts: PendingPromptsRepository,
    private readonly addTransaction: AddTransaction,
    private readonly overrideMerchant: OverrideMerchantCategory,
    private readonly currentUser: CurrentUserProvider,
  ) {}

  async execute(input: ResolveProactivePromptInput): Promise<ResolveProactivePromptResult> {
    const user = await this.currentUser.resolve();
    const prompt = await this.prompts.getById(user.id, input.promptId);
    if (!prompt) throw new NotFoundException(`prompt ${input.promptId} not found`);

    // Idempotency: only a pending confirm prompt is resolvable. Anything else
    // (already added/discarded, or an auto/notice prompt) is a no-op.
    if (prompt.status !== 'pending') return { prompt, transaction: null };

    if (input.action === 'discard') {
      await this.prompts.markDiscarded(prompt.id);
      return { prompt: await this.reload(user.id, prompt.id), transaction: null };
    }

    const category = input.overrides?.category ?? prompt.suggestedCategory;
    const { transaction } = await this.addTransaction.execute({
      amount: prompt.amount,
      category,
      description: input.overrides?.description ?? prompt.suggestedDescription,
      merchant: prompt.merchant ?? '',
      date: prompt.paymentDate.slice(0, 10),
      userId: user.id,
      direction: prompt.kind,
      source: 'mercadopago',
      mpPaymentId: prompt.mpPaymentId,
      counterparty: prompt.counterparty,
    });
    await this.prompts.markAdded(prompt.id, transaction.id);

    if (input.overrides?.rememberMerchantCategory && prompt.merchant) {
      await this.overrideMerchant.execute({ merchant: prompt.merchant, category });
    }

    return { prompt: await this.reload(user.id, prompt.id), transaction };
  }

  private async reload(userId: string, promptId: string): Promise<PendingPrompt> {
    const updated = await this.prompts.getById(userId, promptId);
    if (!updated) throw new NotFoundException(`prompt ${promptId} not found`);
    return updated;
  }
}
