import { z } from 'zod';

/** Lenient — MP sends extra fields beyond what we model. */
export const mpWebhookBody = z
  .object({
    type: z.string(),
    action: z.string().optional(),
    data: z.object({ id: z.string() }),
    user_id: z.union([z.number(), z.string()]).optional(),
    live_mode: z.boolean().optional(),
  })
  .passthrough();

export type MpWebhookBody = z.infer<typeof mpWebhookBody>;
