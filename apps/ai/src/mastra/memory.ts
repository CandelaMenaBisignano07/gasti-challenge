import { Memory } from '@mastra/memory';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { buildMastraVector } from './storage';
import { workingMemorySchema } from './working-memory.schema';

/**
 * Builds the Gasti agent's Memory: short-term history, resource-scoped
 * semantic recall, and a resource-scoped working-memory mirror.
 * Storage is inherited from the Mastra-level `storage` — not passed here.
 * See 2026-05-17-gasti-memory-design.md.
 */
export function buildGastiMemory() {
  return new Memory({
    vector: buildMastraVector(),
    embedder: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
    options: {
      lastMessages: 10,
      semanticRecall: { topK: 2, messageRange: 2, scope: 'resource' },
      workingMemory: {
        enabled: true,
        schema: workingMemorySchema,
        scope: 'resource',
      },
    },
  });
}
