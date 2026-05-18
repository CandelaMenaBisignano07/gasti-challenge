import { test, expect } from 'bun:test';
import { RequestContext } from '@mastra/core/request-context';
import { buildInstructions } from './instructions';

function context(values: Record<string, unknown>): RequestContext {
  const rc = new RequestContext<Record<string, unknown>>();
  for (const [key, value] of Object.entries(values)) rc.set(key, value);
  return rc;
}

const base = { today: '2026-05-18', categories: ['comida', 'transporte'] };

test('includes the session-resume clause when sessionResumed is true', () => {
  const prompt = buildInstructions(context({ ...base, sessionResumed: true }));
  expect(prompt).toContain('reopened the chat');
});

test('omits the resume clause when sessionResumed is false or unset', () => {
  expect(buildInstructions(context({ ...base, sessionResumed: false }))).not.toContain('reopened the chat');
  expect(buildInstructions(context(base))).not.toContain('reopened the chat');
});

test('tells the agent to drop a lapsed mutation silently', () => {
  expect(buildInstructions(context(base))).toContain('drop it silently');
});
