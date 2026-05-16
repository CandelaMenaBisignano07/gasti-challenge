export interface ApiErrorEnvelope {
  error: { code: string; message: string };
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
