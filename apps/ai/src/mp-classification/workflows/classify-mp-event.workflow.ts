/**
 * Mercado Pago payment classifier — apps/ai's first Mastra Workflow.
 *
 * Registered in `src/mastra/index.ts` under the key `classifyMpEvent`. The Mastra
 * dev/server exposes registered workflows over HTTP; the run-and-await route is:
 *
 *   POST /api/workflows/classify-mp-event/start-async
 *
 * (`classify-mp-event` is the workflow `id`, not the registry key.) Base URL is the
 * `mastra dev` server — http://localhost:4111 by default.
 *
 * Request body:
 *   {
 *     "inputData": {
 *       "kind": "income" | "expense",
 *       "amount": number,            // positive
 *       "merchant": string | null,
 *       "description": string | null,
 *       "counterparty": string | null
 *     }
 *   }
 *   // optional: "requestContext", "initialState", "resourceId", "tracingOptions"
 *
 * Response body (status "success"):
 *   {
 *     "status": "success",
 *     "result": {
 *       "category": "comida" | "transporte" | "entretenimiento" | "salud"
 *                 | "servicios" | "educacion" | "otros",
 *       "suggestedDescription": string,
 *       "confidence": number          // 0..1
 *     },
 *     "steps": { ... }
 *   }
 * Non-success runs return `status` "failed" | "suspended" | "tripwire" with error
 * details instead of `result`.
 *
 * NOTE for Phase 4: re-verify this route against the running `mastra dev` server
 * (`GET /api/workflows` lists registered workflows and their ids).
 */
import { toStandardSchema } from '@mastra/core/schema';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { classifyMpEventInput, classificationSchema } from '../domain/classification';
import { mpClassifierAgent } from '../agents/mp-classifier.agent';

const buildPrompt = createStep({
  id: 'build-classification-prompt',
  inputSchema: classifyMpEventInput,
  outputSchema: z.object({ prompt: z.string() }),
  execute: async ({ inputData }) => ({
    prompt: [
      `Tipo: ${inputData.kind === 'income' ? 'cobro entrante' : 'pago saliente'}`,
      `Monto: ARS ${inputData.amount}`,
      `Comercio: ${inputData.merchant ?? 'desconocido'}`,
      `Descripción MP: ${inputData.description ?? 'ninguna'}`,
      `Contraparte: ${inputData.counterparty ?? 'desconocida'}`,
    ].join('\n'),
  }),
});

// `structuredOutput.schema` expects a `StandardSchemaWithJSON`; `toStandardSchema`
// is Mastra's adapter that wraps a plain Zod (v3) schema into that shape.
const classifyStep = createStep(mpClassifierAgent, {
  structuredOutput: { schema: toStandardSchema(classificationSchema) },
});

export const classifyMpEventWorkflow = createWorkflow({
  id: 'classify-mp-event',
  inputSchema: classifyMpEventInput,
  outputSchema: classificationSchema,
})
  .then(buildPrompt)
  .then(classifyStep)
  .commit();
