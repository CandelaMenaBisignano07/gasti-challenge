import { afterEach, describe, expect, test } from 'bun:test';
import { HttpMpPaymentsSearchGateway } from './http-mp-payments-search.gateway';

type FetchArgs = { url: string; init: RequestInit | undefined };

function mockFetch(responses: Array<{ status?: number; body: unknown }>) {
  const calls: FetchArgs[] = [];
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

describe('HttpMpPaymentsSearchGateway', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('builds the search URL with begin/end/sort params + bearer header', async () => {
    const calls = mockFetch([{ body: { paging: { total: 0, limit: 30, offset: 0 }, results: [] } }]);
    const gw = new HttpMpPaymentsSearchGateway();
    await gw.search({
      accessToken: 'tok',
      beginDate: new Date('2026-05-22T18:00:00.000Z'),
      endDate: new Date('2026-05-22T18:30:00.000Z'),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('https://api.mercadopago.com/v1/payments/search');
    expect(calls[0].url).toContain('begin_date=2026-05-22T18%3A00%3A00.000Z');
    expect(calls[0].url).toContain('end_date=2026-05-22T18%3A30%3A00.000Z');
    expect(calls[0].url).toContain('sort=date_created');
    expect(calls[0].url).toContain('criteria=desc');
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  test('loops pagination until results stop coming, with safety cap', async () => {
    const page = (offset: number, count: number) => ({
      body: {
        paging: { total: 80, limit: 30, offset },
        results: Array.from({ length: count }, (_, i) => ({ id: offset + i })),
      },
    });
    mockFetch([page(0, 30), page(30, 30), page(60, 20)]);
    const gw = new HttpMpPaymentsSearchGateway();
    const res = await gw.search({
      accessToken: 'tok',
      beginDate: new Date('2026-05-22T18:00:00.000Z'),
      endDate: new Date('2026-05-22T18:30:00.000Z'),
    });
    expect(res.results).toHaveLength(80);
    expect(res.truncated).toBe(false);
    expect(res.totalReported).toBe(80);
  });

  test('honors maxResults cap and marks truncated', async () => {
    const page = (offset: number, count: number) => ({
      body: {
        paging: { total: 999, limit: 30, offset },
        results: Array.from({ length: count }, (_, i) => ({ id: offset + i })),
      },
    });
    mockFetch([page(0, 30), page(30, 30), page(60, 30)]);
    const gw = new HttpMpPaymentsSearchGateway();
    const res = await gw.search({
      accessToken: 'tok',
      beginDate: new Date(),
      endDate: new Date(),
      maxResults: 60,
    });
    expect(res.results).toHaveLength(60);
    expect(res.truncated).toBe(true);
  });

  test('throws on non-2xx status with status code preserved', async () => {
    mockFetch([{ status: 502, body: 'gateway timeout' }]);
    const gw = new HttpMpPaymentsSearchGateway();
    await expect(
      gw.search({
        accessToken: 'tok',
        beginDate: new Date(),
        endDate: new Date(),
      }),
    ).rejects.toThrow(/HTTP 502/);
  });
});
