import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../domain/domain-error';

const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
};

/** Renders every error as the `{ error: { code, message } }` envelope. */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      res.status(STATUS_BY_CODE[exception.code] ?? 400).json({
        error: { code: exception.code, message: exception.message },
      });
      return;
    }

    const message = exception instanceof Error ? exception.message : 'Unexpected error';
    res.status(500).json({ error: { code: 'INTERNAL', message } });
  }
}
