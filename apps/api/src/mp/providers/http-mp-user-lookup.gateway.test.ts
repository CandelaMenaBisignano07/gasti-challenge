import { afterEach, describe, expect, test } from 'bun:test';
import { HttpMpUserLookupGateway } from './http-mp-user-lookup.gateway';

type Resp = { status?: number; body?: unknown };

function mockFetch(responses: Resp[]) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  let i = 0;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const r = responses[i++] ?? { status: 500, body: 'no more responses' };
    return new Response(
      typeof r.body === 'string' ? r.body : JSON.stringify(r.body),
      { status: r.status ?? 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  return calls;
}

describe('HttpMpUserLookupGateway', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('returns nickname from /users/{id} and uses bearer auth', async () => {
    const calls = mockFetch([{ body: { id: 42, nickname: 'ELHIGIENISTA' } }]);
    const gw = new HttpMpUserLookupGateway();
    expect(await gw.lookupNickname('42', 'tok')).toBe('ELHIGIENISTA');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.mercadopago.com/users/42');
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  test('caches hits — repeated lookups for the same id do not re-fetch', async () => {
    const calls = mockFetch([{ body: { nickname: 'JUAN.PEREZ' } }]);
    const gw = new HttpMpUserLookupGateway();
    await gw.lookupNickname('99', 'tok');
    await gw.lookupNickname('99', 'tok');
    await gw.lookupNickname('99', 'tok');
    expect(calls).toHaveLength(1); // only the first call hit the network
  });

  test('caches misses — 404 is remembered so we do not hammer', async () => {
    const calls = mockFetch([{ status: 404, body: 'not found' }]);
    const gw = new HttpMpUserLookupGateway();
    expect(await gw.lookupNickname('xx', 'tok')).toBeNull();
    expect(await gw.lookupNickname('xx', 'tok')).toBeNull();
    expect(calls).toHaveLength(1);
  });

  test('returns null when the response lacks a nickname', async () => {
    mockFetch([{ body: { id: 7 /* no nickname */ } }]);
    const gw = new HttpMpUserLookupGateway();
    expect(await gw.lookupNickname('7', 'tok')).toBeNull();
  });
});
