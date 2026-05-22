import type { MpPayment } from './mp-payment';
import type { User } from '../../users/domain/user';

/** Derive a human-readable merchant from the MP payment shape. */
export function merchantOf(p: MpPayment): string | null {
  const itemTitle = p.additional_info?.items?.[0]?.title;
  return itemTitle ?? p.description ?? null;
}

/** Join the payer's first and last name when present. */
export function payerNameOf(p: MpPayment): string | null {
  const name = [p.payer?.first_name, p.payer?.last_name]
    .filter((s): s is string => Boolean(s))
    .join(' ')
    .trim();
  return name.length > 0 ? name : null;
}

/** Income iff the collector is the connected user; expense otherwise. */
export function paymentDirection(
  p: MpPayment,
  u: Pick<User, 'mpUserId'>,
): 'income' | 'expense' {
  return p.collector_id === Number(u.mpUserId) ? 'income' : 'expense';
}
