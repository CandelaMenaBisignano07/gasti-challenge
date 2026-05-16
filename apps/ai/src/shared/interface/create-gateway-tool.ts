import { createTool } from '@mastra/core/tools';
import type { ToolPayloadTransformContext } from '@mastra/core/tools';
import type { ZodTypeAny, z } from 'zod';
import { ApiError } from '../domain/api-error';
import type { GatewayCtx } from '../domain/gateway-ctx';

interface GatewayToolConfig<TInput extends ZodTypeAny, TOutput extends ZodTypeAny> {
  id: string;
  description: string;
  inputSchema: TInput;
  outputSchema: TOutput;
  call: (input: z.infer<TInput>, ctx: GatewayCtx) => Promise<z.infer<TOutput>>;
  transform?: (output: z.infer<TOutput>) => unknown;
}

/**
 * Builds a Mastra tool that parses input, calls one gateway method, and returns
 * the result. `userId` is read from requestContext (set by server middleware).
 * On an ApiError it returns a structured error object so the agent can narrate
 * it honestly instead of fabricating an answer.
 */
export function createGatewayTool<TInput extends ZodTypeAny, TOutput extends ZodTypeAny>(
  config: GatewayToolConfig<TInput, TOutput>,
) {
  return createTool({
    id: config.id,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: config.outputSchema,
    ...(config.transform
      ? {
          transform: {
            display: {
              output: (ctx: ToolPayloadTransformContext) => config.transform!(ctx.output as z.infer<TOutput>),
            },
          },
        }
      : {}),
    execute: async (inputData, context) => {
      const userId = (context?.requestContext?.get('userId') as string | undefined) ?? 'default-user';
      try {
        return await config.call(inputData as z.infer<TInput>, { userId });
      } catch (err) {
        if (err instanceof ApiError) {
          return { error: true, code: err.code, message: err.message } as unknown as z.infer<TOutput>;
        }
        return {
          error: true,
          code: 'UNREACHABLE',
          message: 'No pude consultar tus datos en este momento.',
        } as unknown as z.infer<TOutput>;
      }
    },
  });
}
