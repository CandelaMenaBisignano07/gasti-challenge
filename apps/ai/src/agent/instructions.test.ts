import { test, expect } from 'bun:test';
import { RequestContext } from '@mastra/core/request-context';
import { buildInstructions } from './instructions';

function context(values: Record<string, unknown>): RequestContext {
  const rc = new RequestContext<Record<string, unknown>>();
  for (const [key, value] of Object.entries(values)) rc.set(key, value);
  return rc;
}

const base = {
  today: '2026-05-18',
  categoriesWithDescriptions: [
    { name: 'comida', description: 'x' },
    { name: 'transporte', description: 'y' },
  ],
};

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

test('tells the agent to re-call proposeTransactionMutation on a repeated request', () => {
  expect(buildInstructions(context(base))).toContain('repeating or rephrasing');
});

test('instructions interpolate categories as "- name: description" lines', () => {
  const mockContext = {
    get(key: string) {
      if (key === 'today') return '2026-05-22';
      if (key === 'categoriesWithDescriptions')
        return [
          { name: 'comida', description: 'restaurantes y delivery' },
          { name: 'mascotas', description: '' },
        ];
      return undefined;
    },
  } as never;
  const prompt = buildInstructions(mockContext);
  expect(prompt).toContain('- comida: restaurantes y delivery');
  expect(prompt).toContain('- mascotas: (sin descripción)');
});
