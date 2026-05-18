import { Agent } from '@mastra/core/agent';

/**
 * The classifier agent used by the `classify-mp-event` workflow. It has no
 * injected dependencies, so it is a plain module-level Agent (unlike the
 * conversational `gasti` agent, whose factory takes tools/memory).
 */
export const mpClassifierAgent = new Agent({
  id: 'mp-classifier',
  name: 'MP Classifier',
  model: 'openai/gpt-4o',
  instructions: `You classify a single Mercado Pago payment for an Argentine personal-finance app.
Given the payment, choose exactly one category:
- comida: groceries, restaurants, delivery, cafés
- transporte: rides, fuel, public transit, tolls, parking
- entretenimiento: streaming, games, events, bars, leisure
- salud: pharmacy, medical, insurance, gym
- servicios: utilities, telecom, subscriptions, home services
- educacion: courses, tuition, books, training
- otros: anything that does not clearly fit the above
Write a short neutral Spanish description (max 6 words, no emojis).
Report confidence 0..1 — how sure the category is. If the merchant/counterparty is unknown or
ambiguous, use 'otros' and a low confidence. For income payments, still pick the closest category.`,
});
