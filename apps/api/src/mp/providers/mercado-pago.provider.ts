import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MpPayment } from '../domain/mp-payment';
import type { MpPaymentSource } from '../domain/mp-payment-source';
import { USERS_REPOSITORY, type UsersRepository } from '../../users/domain/users.repository';
import { RefreshMpToken } from '../use-cases/refresh-mp-token.use-case';
import { isMpTokenExpired } from '../../users/domain/user';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BACKOFF = [250, 1000, 4000];

/** Fetches Mercado Pago payment details; refreshes token on 401, backs off on 429/5xx. */
@Injectable()
export class MercadoPagoProvider implements MpPaymentSource {
  private readonly log = new Logger(MercadoPagoProvider.name);
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly refresh: RefreshMpToken,
  ) {}

  async getById(paymentId: string, userId: string): Promise<MpPayment> {
    let user = await this.users.getCurrent();
    let token = isMpTokenExpired(user)
      ? await this.refresh.execute(user)
      : user.mpAccessToken!;

    for (let attempt = 0; attempt <= BACKOFF.length; attempt++) {
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) return (await res.json()) as MpPayment;
      if (res.status === 401 && attempt === 0) {
        user = await this.users.getCurrent();
        token = await this.refresh.execute(user);
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt < BACKOFF.length) {
          await sleep(BACKOFF[attempt]);
          continue;
        }
      }
      throw new Error(`MP payment fetch failed: HTTP ${res.status}`);
    }
    throw new Error('MP payment fetch failed: retries exhausted');
  }
}
