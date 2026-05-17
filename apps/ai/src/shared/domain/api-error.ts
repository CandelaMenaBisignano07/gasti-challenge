import { z } from 'zod';

export interface ApiErrorEnvelope {
  error: { code: string; message: string };
}

/**
 * The structured error a gateway tool returns when a call fails (transport
 * failure or a domain error envelope from `apps/api`). It is a *valid* tool
 * output — every gateway tool's `outputSchema` is widened to accept it — so
 * the agent can narrate the failure honestly instead of fabricating an answer.
 */
export const gatewayErrorSchema = z.object({
  error: z.literal(true),
  code: z.string(),
  message: z.string(),
});

export type GatewayError = z.infer<typeof gatewayErrorSchema>;

export function isGatewayError(value: unknown): value is GatewayError {
  return gatewayErrorSchema.safeParse(value).success;
}

export function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }
  const { error } = value as ApiErrorEnvelope;
  return typeof error?.code === 'string' && typeof error?.message === 'string';
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
