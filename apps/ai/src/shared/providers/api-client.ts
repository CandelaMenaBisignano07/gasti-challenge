import { ApiError, isApiErrorEnvelope } from '../domain/api-error';
import type { GatewayCtx } from '../domain/gateway-ctx';

const DEFAULT_BASE_URL = 'http://localhost:3001';
const RETRY_DELAY_MS = 300;

export interface ApiClient {
  post<TOut>(path: string, body: unknown, ctx: GatewayCtx): Promise<TOut>;
}

export function makeApiClient(
  // `||` (not `??`) so an empty or whitespace-only API_BASE_URL also falls back —
  // an unset env var reads as '' here, and `?? ` would not catch that.
  baseUrl: string = process.env.API_BASE_URL?.trim() || DEFAULT_BASE_URL,
): ApiClient {
  async function attempt<TOut>(path: string, body: unknown, ctx: GatewayCtx): Promise<TOut> {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': ctx.userId },
      body: JSON.stringify(body),
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const code = isApiErrorEnvelope(json) ? json.error.code : 'HTTP_ERROR';
      const message = isApiErrorEnvelope(json) ? json.error.message : `HTTP ${res.status}`;
      throw new ApiError(code, message, res.status);
    }
    return json as TOut;
  }

  return {
    async post<TOut>(path: string, body: unknown, ctx: GatewayCtx): Promise<TOut> {
      try {
        return await attempt<TOut>(path, body, ctx);
      } catch (err) {
        const retryable = !(err instanceof ApiError) || err.status >= 500;
        if (!retryable) throw err;
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return attempt<TOut>(path, body, ctx);
      }
    },
  };
}
