import { Agent } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import { buildInstructions } from './instructions';

export interface GastiAgentDeps {
  tools: Record<string, unknown>;
  memory?: unknown;
}

export function makeGastiAgent({ tools, memory }: GastiAgentDeps) {
  return new Agent({
    id: 'gasti',
    name: 'Gasti',
    model: 'openai/gpt-4o',
    instructions: async ({ requestContext }) => buildInstructions(requestContext as RequestContext),
    requestContextSchema: z.object({ today: z.string(), userId: z.string() }),
    tools: tools as never,
    ...(memory ? { memory: memory as never } : {}),
  });
}
