import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../shared/domain/domain-error';
import { CategoryRegistry } from '../../shared/providers/category-registry';
import { CategoryResolver } from '../../shared/providers/category-resolver';
import {
  TRANSACTIONS_REPOSITORY,
  type TransactionsRepository,
} from '../../transactions/domain/transactions.repository';
import { normalizeCategoryName } from '../providers/category-name';

export interface ProposeCategoryChangeInput {
  intent: 'delete' | 'rename';
  name: string;
  newName?: string;
}

export interface ProposeCategoryChangeResult {
  intent: 'delete' | 'rename';
  name: string;
  newName?: string;
  affectedTransactionCount: number;
}

/** Read-only. Validates a category delete/rename and counts the transactions it would move. */
@Injectable()
export class ProposeCategoryChange {
  constructor(
    @Inject(TRANSACTIONS_REPOSITORY) private readonly txRepo: TransactionsRepository,
    private readonly resolver: CategoryResolver,
    private readonly registry: CategoryRegistry,
  ) {}

  async execute(input: ProposeCategoryChangeInput): Promise<ProposeCategoryChangeResult> {
    const name = normalizeCategoryName(input.name);
    const verb = input.intent === 'delete' ? 'borrar' : 'renombrar';

    if (this.registry.isDefault(name)) {
      throw new DomainError(
        'VALIDATION_ERROR',
        `"${name}" es una categoría por defecto y no se puede ${verb}.`,
      );
    }
    if (!(await this.registry.isCustom(name))) {
      throw new DomainError('NOT_FOUND', `La categoría "${name}" no existe.`);
    }

    let newName: string | undefined;
    if (input.intent === 'rename') {
      if (input.newName === undefined) {
        throw new DomainError('VALIDATION_ERROR', 'Falta el nuevo nombre de la categoría.');
      }
      newName = normalizeCategoryName(input.newName);
      if (newName.length === 0 || newName.length > 24) {
        throw new DomainError(
          'VALIDATION_ERROR',
          'El nombre de la categoría debe tener entre 1 y 24 caracteres.',
        );
      }
      if (newName !== name && (await this.registry.exists(newName))) {
        throw new DomainError('VALIDATION_ERROR', `La categoría "${newName}" ya existe.`);
      }
    }

    const txs = await this.txRepo.all();
    const resolved = await this.resolver.resolveAll(txs);
    let affectedTransactionCount = 0;
    for (const tx of txs) {
      if (resolved.get(tx.id) === name) affectedTransactionCount += 1;
    }

    return {
      intent: input.intent,
      name,
      ...(newName !== undefined ? { newName } : {}),
      affectedTransactionCount,
    };
  }
}
