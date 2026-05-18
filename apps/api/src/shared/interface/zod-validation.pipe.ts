import { PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { DomainError } from '../domain/domain-error';

/** Validates a request body against a Zod schema; rejects with a DomainError. */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const message =
        result.error.issues
          .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
          .join('; ') || 'invalid input';
      throw new DomainError('VALIDATION_ERROR', message);
    }
    return result.data;
  }
}
