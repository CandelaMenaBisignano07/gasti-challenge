/**
 * Transaction classifier — apps/ai's first generalized classification workflow.
 *
 * Registered in `src/mastra/index.ts` under the key `classifyTransaction`. Mastra
 * exposes it at:
 *
 *   POST /api/workflows/classify-transaction/start-async
 *
 * Request body:
 *   {
 *     "inputData": {
 *       "merchant": string,
 *       "description": string | null,
 *       "amount": number,        // positive
 *       "direction": "expense" | "income",
 *       "categories": [{ "name": string, "description": string }, ...]
 *     }
 *   }
 *
 * Response body (status "success"):
 *   {
 *     "status": "success",
 *     "result": {
 *       "category": string,           // one of the supplied category names
 *       "confidence": number,         // 0..1
 *       "reasoning": string?          // optional, Spanish, max 160 chars
 *     }
 *   }
 */
import { toStandardSchema } from '@mastra/core/schema';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { classifyTransactionInput, classificationResult } from '../domain/classification';
import { transactionClassifierAgent } from '../agents/transaction-classifier.agent';

const buildPrompt = createStep({
  id: 'build-classification-prompt',
  inputSchema: classifyTransactionInput,
  outputSchema: z.object({ prompt: z.string() }),
  execute: async ({ inputData }) => ({
    prompt: [
      'CATEGORIES (use these descriptions as the source of truth):',
      ...inputData.categories.map((c) => `- ${c.name}: ${c.description || '(sin descripción)'}`),
      '',
      'TRANSACTION:',
      `Direction: ${inputData.direction === 'income' ? 'cobro entrante' : 'pago saliente'}`,
      `Amount: ARS ${inputData.amount}`,
      `Merchant: ${inputData.merchant}`,
      `Description: ${inputData.description ?? '(none)'}`,
    ].join('\n'),
  }),
});

const classifyStep = createStep(transactionClassifierAgent, {
  structuredOutput: { schema: toStandardSchema(classificationResult) },
});

export const classifyTransactionWorkflow = createWorkflow({
  id: 'classify-transaction',
  inputSchema: classifyTransactionInput,
  outputSchema: classificationResult,
})
  .then(buildPrompt)
  .then(classifyStep)
  .commit();
