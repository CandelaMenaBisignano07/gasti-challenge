export type OperationType = 'regular_payment' | 'money_transfer' | 'recurring_payment';
export type Direction = 'income' | 'expense';

export interface LeadCopy {
  readonly lead: string;
  readonly relator: 'a' | 'de';
}

export function pickLeadCopy(input: {
  operationType: OperationType;
  direction: Direction;
}): LeadCopy {
  const { operationType, direction } = input;
  if (operationType === 'money_transfer') {
    return direction === 'income'
      ? { lead: 'Te transfirieron', relator: 'de' }
      : { lead: 'Transferiste', relator: 'a' };
  }
  if (operationType === 'recurring_payment' && direction === 'expense') {
    return { lead: 'Pago recurrente', relator: 'de' };
  }
  // regular_payment (and recurring income fallback)
  return direction === 'income'
    ? { lead: 'Te llegaron', relator: 'de' }
    : { lead: 'Pagaste', relator: 'a' };
}
