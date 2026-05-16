import type { ApiClient } from './api-client';
import type { GatewayCtx } from '../domain/gateway-ctx';

/**
 * Builds an HTTP gateway implementation from a declarative route map.
 * Every gateway method is `api.post(path, input, ctx)`, so a gateway interface
 * is satisfied by mapping each method name to its endpoint path.
 * `Record<keyof G, string>` makes a missing route a compile error.
 */
export function makeHttpGateway<G extends object>(
  api: ApiClient,
  routes: Record<keyof G, string>,
): G {
  const gateway: Record<string, unknown> = {};
  for (const key of Object.keys(routes) as (keyof G)[]) {
    const path = routes[key];
    gateway[key as string] = (input: unknown, ctx: GatewayCtx) => api.post(path, input, ctx);
  }
  return gateway as G;
}
