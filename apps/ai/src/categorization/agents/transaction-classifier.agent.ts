import { Agent } from '@mastra/core/agent';

/**
 * The classifier agent used by the `classify-transaction` workflow. It has no
 * injected dependencies; the category list (with descriptions) is supplied as
 * input data each call, not baked into the prompt.
 */
export const transactionClassifierAgent = new Agent({
  id: 'transaction-classifier',
  name: 'Transaction Classifier',
  model: 'openai/gpt-4o',
  instructions: `You classify a single Argentine personal-finance transaction.

You receive the list of available categories with a short description of what
each one contains. Use ONLY those descriptions to decide — do not rely on prior
knowledge of what "comida" or "transporte" usually means. The user's description
is the source of truth.

Pick exactly one category from the provided list. If nothing fits, pick "otros"
with low confidence — do not invent a category name that is not in the list.

Report:
- category: one of the provided category names (exact match, case-sensitive).
- confidence: 0..1, how sure you are. Use < 0.4 when the merchant is unknown or
  the description is genuinely ambiguous across two categories. Use > 0.8 when
  the merchant clearly matches one of the descriptions.
- reasoning (optional, max 160 chars, Spanish): a one-line trace of the cue that
  led you to the category. For debugging.`,
});
