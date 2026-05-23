/**
 * Resolves a Mercado Pago user id (e.g. a payment's `collector.id`) to the
 * account's public nickname — the only human-readable handle MP exposes for
 * the OTHER party on outgoing transfers, where the `collector` block ships
 * its name/email fields as null for privacy.
 */
export const MP_USER_LOOKUP_GATEWAY = 'MP_USER_LOOKUP_GATEWAY';

export interface MpUserLookupGateway {
  /**
   * Returns the user's public nickname (e.g. "ELHIGIENISTA") when found,
   * or null when the id is unknown, the account is closed, or the lookup
   * fails. Implementations are free to cache results — repeated lookups of
   * the same id in a single backfill are common.
   */
  lookupNickname(userId: string, accessToken: string): Promise<string | null>;
}
