import { toStandardSchema } from '@mastra/core/schema';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { classifyBatchInput, classifyBatchOutput } from '../domain/classify-batch';
import { mpClassifierAgent } from '../agents/mp-classifier.agent';

const buildPrompt = createStep({
  id: 'build-batch-prompt',
  inputSchema: classifyBatchInput,
  outputSchema: z.object({ prompt: z.string() }),
  execute: async ({ inputData }) => {
    const items = inputData.payments
      .map((p, i) =>
        [
          `--- Pago #${i + 1} ---`,
          `Tipo: ${p.kind === 'income' ? 'cobro entrante' : 'pago saliente'}`,
          `Monto: ARS ${p.amount}`,
          `Comercio: ${p.merchant ?? 'desconocido'}`,
          `Descripción MP: ${p.description ?? 'ninguna'}`,
          `Contraparte: ${p.counterparty ?? 'desconocida'}`,
        ].join('\n'),
      )
      .join('\n\n');
    return {
      prompt: [
        'Te paso una lista de pagos para clasificar. Devolvé un array `classifications` con un objeto por pago, en el mismo orden.',
        items,
      ].join('\n\n'),
    };
  },
});

const classifyStep = createStep(mpClassifierAgent, {
  structuredOutput: { schema: toStandardSchema(classifyBatchOutput) },
});

export const classifyBatchWorkflow = createWorkflow({
  id: 'classify-batch',
  inputSchema: classifyBatchInput,
  outputSchema: classifyBatchOutput,
})
  .then(buildPrompt)
  .then(classifyStep)
  .commit();
