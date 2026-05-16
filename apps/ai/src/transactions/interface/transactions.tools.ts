import { createGatewayTool } from '../../shared/interface/create-gateway-tool';
import * as s from '../domain/transactions.gateway';
import type { TransactionsGateway } from '../domain/transactions.gateway';

export function makeTransactionsTools(gateway: TransactionsGateway) {
  return {
    proposeTransactionMutation: createGatewayTool({
      id: 'proposeTransactionMutation',
      description:
        'Read-only. Resolve the target transaction(s) for a pending delete or update so a confirmation can be raised. Always call this before deleteTransaction or updateTransaction.',
      inputSchema: s.proposeMutationInput,
      outputSchema: s.proposeMutationResult,
      call: (i, c) => gateway.proposeMutation(i, c),
      transform: (output) => {
        if (output.matches.length === 1) {
          const tx = output.matches[0];
          const confirmLabel = output.intent === 'delete' ? 'Sí, borralo' : 'Sí, guardá los cambios';
          return {
            kind: 'optionPills',
            options: [
              { id: `confirm:${output.intent}:${tx.id}`, label: confirmLabel, intent: 'confirm' },
              { id: 'cancel', label: 'Cancelar', intent: 'cancel' },
            ],
          };
        }
        return { kind: 'transactionList', items: output.matches };
      },
    }),
    addTransaction: createGatewayTool({
      id: 'addTransaction',
      description: 'Create a new transaction. Non-destructive — no confirmation needed.',
      inputSchema: s.addTransactionInput,
      outputSchema: s.addTransactionResult,
      call: (i, c) => gateway.add(i, c),
    }),
    updateTransaction: createGatewayTool({
      id: 'updateTransaction',
      description:
        'Edit an existing transaction. Confirmation-gated: only call after proposeTransactionMutation and an explicit user confirmation.',
      inputSchema: s.updateTransactionInput,
      outputSchema: s.updateTransactionResult,
      call: (i, c) => gateway.update(i, c),
    }),
    deleteTransaction: createGatewayTool({
      id: 'deleteTransaction',
      description:
        'Delete a transaction. Confirmation-gated: only call after proposeTransactionMutation and an explicit user confirmation.',
      inputSchema: s.deleteTransactionInput,
      outputSchema: s.deleteTransactionResult,
      call: (i, c) => gateway.remove(i, c),
    }),
  };
}
