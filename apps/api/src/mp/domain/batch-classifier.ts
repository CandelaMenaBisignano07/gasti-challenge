import type { User } from '../../users/domain/user';
import type { MpPayment } from './mp-payment';
import type { Classification } from './classification';

export const BATCH_CLASSIFIER = 'BATCH_CLASSIFIER';

export interface BatchClassifyArgs {
  readonly user: User;
  readonly payments: readonly MpPayment[];
}

/**
 * Classifies a batch of Mercado Pago payments in one round-trip to apps/ai
 * (`classify-batch` workflow). Returns one Classification per payment, in
 * the same order as the input.
 */
export interface BatchClassifier {
  classifyBatch(args: BatchClassifyArgs): Promise<Classification[]>;
}
