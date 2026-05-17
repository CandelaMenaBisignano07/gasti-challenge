import { createTool } from '@mastra/core/tools';
import type { ToolPayloadTransformContext } from '@mastra/core/tools';
import { z } from 'zod';
import type { ZodTypeAny } from 'zod';
import { ApiError, gatewayErrorSchema, isGatewayError } from '../domain/api-error';
import type { GatewayError } from '../domain/api-error';
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
 *
 * The tool's `outputSchema` is the success schema *widened with* the gateway
 * error envelope: on an `ApiError` (or any transport failure) the tool returns
 * a structured `{ error, code, message }` object that still validates, so the
 * agent can narrate the failure honestly instead of fabricating an answer.
 */
export function createGatewayTool<TInput extends ZodTypeAny, TOutput extends ZodTypeAny>(
  config: GatewayToolConfig<TInput, TOutput>,
) {
  return createTool({
    id: config.id,
    description: config.description,
    inputSchema: config.inputSchema,
    outputSchema: z.union([config.outputSchema, gatewayErrorSchema]),
    ...(config.transform
      ? {
          transform: {
            display: {
              output: (ctx: ToolPayloadTransformContext) => {
                const output = ctx.output;
                // An error envelope has no domain shape to transform — pass it through.
                if (isGatewayError(output)) return output;
                return config.transform!(output as z.infer<TOutput>);
              },
            },
          },
        }
      : {}),
    execute: async (inputData, context): Promise<z.infer<TOutput> | GatewayError> => {
      const userId = (context?.requestContext?.get('userId') as string | undefined) ?? 'default-user';
      try {
        return await config.call(inputData as z.infer<TInput>, { userId });
      } catch (err) {
        if (err instanceof ApiError) {
          return { error: true, code: err.code, message: err.message };
        }
        return {
          error: true,
          code: 'UNREACHABLE',
          message: 'No pude consultar tus datos en este momento.',
        };
      }
    },
  });
}
