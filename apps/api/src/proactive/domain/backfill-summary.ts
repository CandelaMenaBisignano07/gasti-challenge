import type { BackfillScope } from '../../mp/domain/backfill-scope';
import type { OperationType } from '../../mp/domain/operation-type';

export interface BackfillSummary {
  readonly id: string;
  readonly userId: string;
  readonly scope: BackfillScope;
  readonly rangeBegin: Date;
  readonly rangeEnd: Date;
  readonly totalImported: number;
  readonly byOperationType: Record<OperationType, number>;
  readonly lowConfidenceCount: number;
  readonly truncated: boolean;
  readonly status: 'visible' | 'dismissed';
  readonly createdAt: Date;
}
