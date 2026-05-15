import { Mastra } from '@mastra/core';
import { placeholderAgent } from './agents';
import { buildMastraStorage } from './storage';

export const mastra = new Mastra({
  agents: { placeholderAgent },
  storage: buildMastraStorage(),
});
