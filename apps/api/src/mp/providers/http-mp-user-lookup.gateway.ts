import { Injectable, Logger } from '@nestjs/common';
import type { MpUserLookupGateway } from '../domain/mp-user-lookup.gateway';

const LOOKUP_URL = (id: string) => `https://api.mercadopago.com/users/${id}`;

/**
 * Calls MP's public `/users/{id}` endpoint to resolve a collector id to a
 * nickname. Caches results (including misses) in-memory for the process'
 * lifetime — a backfill that imports N transfers to the same recipient
 * pays the round-trip exactly once. Cache is intentionally not persisted:
 * nicknames can change, and a process restart is a cheap reset.
 */
@Injectable()
export class HttpMpUserLookupGateway implements MpUserLookupGateway {
  private readonly log = new Logger(HttpMpUserLookupGateway.name);
  // null = looked up and resolved-as-missing; undefined = never looked up.
  private readonly cache = new Map<string, string | null>();

  async lookupNickname(userId: string, accessToken: string): Promise<string | null> {
    const cached = this.cache.get(userId);
    if (cached !== undefined) return cached;

    try {
      const res = await fetch(LOOKUP_URL(userId), {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        this.log.warn(`MP /users/${userId} HTTP ${res.status} — caching as null`);
        this.cache.set(userId, null);
        return null;
      }
      const body = (await res.json()) as { nickname?: string | null };
      const nickname = typeof body.nickname === 'string' && body.nickname.length > 0
        ? body.nickname
        : null;
      this.cache.set(userId, nickname);
      return nickname;
    } catch (err) {
      this.log.warn(`MP /users/${userId} failed: ${(err as Error).message}`);
      this.cache.set(userId, null);
      return null;
    }
  }
}
