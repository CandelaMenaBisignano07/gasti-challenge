import type { MpPayment } from './mp-payment';
import type { User } from '../../users/domain/user';

/** Derive a human-readable merchant from the MP payment shape. */
export function merchantOf(p: MpPayment): string | null {
  const itemTitle = p.additional_info?.items?.[0]?.title;
  return itemTitle ?? p.description ?? null;
}

/**
 * Best-effort human-readable payer identifier:
 *   1. "First Last" when MP returned either name field.
 *   2. Otherwise the email local-part — readable handle even when the
 *      remitter paid as invitado or hid their name (common for money
 *      transfers between MP users where MP returns null names but always
 *      keeps the email on file).
 * Returns null if neither is available.
 */
export function payerNameOf(p: MpPayment): string | null {
  const fullName = [p.payer?.first_name, p.payer?.last_name]
    .filter((s): s is string => Boolean(s))
    .join(' ')
    .trim();
  if (fullName.length > 0) return fullName;
  const email = p.payer?.email;
  if (email && email.includes('@')) {
    const local = email.split('@')[0];
    if (local && local.length > 0) return local;
  }
  return null;
}

/** Income iff the collector is the connected user; expense otherwise. */
export function paymentDirection(
  p: MpPayment,
  u: Pick<User, 'mpUserId'>,
): 'income' | 'expense' {
  return p.collector_id === Number(u.mpUserId) ? 'income' : 'expense';
}
