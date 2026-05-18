# UI ↔ Agent Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the UI's `MockChatRepository` with a real streaming connection to the Mastra Gasti agent.

**Architecture:** The browser's `AgentChatRepository` POSTs to a same-origin Next.js route handler (`/api/chat`). The handler calls the Mastra agent server-side with `@mastra/client-js`, maps Mastra stream chunks to the UI's `ReplyEvent` contract, and re-emits a clean NDJSON stream. The browser depends only on `ReplyEvent`, never on Mastra's wire format.

**Tech Stack:** Next.js 15 (App Router, route handlers), React 19, TypeScript, `@mastra/client-js`, the Mastra agent server (`apps/ai`).

**Verification model:** `apps/ui` has no test runner — only `bun run typecheck` (`tsc --noEmit`). Each task is verified by typecheck plus, where noted, a manual check against the running dev servers. Spec: `docs/superpowers/specs/2026-05-18-ui-agent-wiring-design.md`.

**Worktree:** Execute this plan in an isolated worktree created via the `superpowers:using-git-worktrees` skill.

---

## File Structure

**New files:**
- `apps/ui/src/chat/infrastructure/chat-session.ts` — resolves `resourceId` (constant) and a `localStorage`-persisted `threadId`.
- `apps/ui/src/chat/providers/mastra-stream-mapper.ts` — stateful mapper: Mastra chunks → `ReplyEvent[]`.
- `apps/ui/app/api/chat/route.ts` — POST route handler; the anti-corruption layer.
- `apps/ui/src/chat/repositories/agent-chat-repository.ts` — `ChatRepository` impl backed by `/api/chat`.

**Modified files:**
- `apps/ui/package.json` — add `@mastra/client-js`.
- `apps/ui/.env.example` — add `MASTRA_BASE_URL`.
- `apps/ui/src/transactions/domain/transaction.ts` — align to agent shape.
- `apps/ui/src/transactions/components/transaction-row.tsx` — drop `signed`.
- `apps/ui/src/budgets/domain/budget-progress.ts` — align to agent shape.
- `apps/ui/src/budgets/providers/budget-state.ts` — `projection` → `projected`.
- `apps/ui/src/chat/repositories/mock-data.ts` — adjust to the new types.
- `apps/ui/src/chat/infrastructure/chat-reducer.ts` — add the streaming path.
- `apps/ui/src/chat/infrastructure/chat-context.tsx` — swap repository, handle `partial`.
- `apps/ui/src/chat/components/chat-screen.tsx` — render the streaming message.

---

## Task 1: Add `@mastra/client-js` dependency and env config

**Files:**
- Modify: `apps/ui/package.json`
- Modify: `apps/ui/.env.example`
- Create: `apps/ui/.env`

- [ ] **Step 1: Add the dependency to `apps/ui/package.json`**

In the `"dependencies"` block, add `@mastra/client-js` (alphabetical order):

```json
  "dependencies": {
    "@mastra/client-js": "^1.10.0",
    "lucide-react": "^0.460.0",
    "next": "^15.1.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
```

- [ ] **Step 2: Install**

Run from the repo root: `bun install`
Expected: `@mastra/client-js` resolves and installs without error.

- [ ] **Step 3: Add `MASTRA_BASE_URL` to `apps/ui/.env.example`**

Append:

```
# Base URL of the Mastra agent server the /api/chat route handler calls.
# Server-side only — do NOT prefix with NEXT_PUBLIC_.
# Empty or absent -> defaults to http://localhost:4112
MASTRA_BASE_URL=http://localhost:4112
```

- [ ] **Step 4: Create `apps/ui/.env`**

```
MASTRA_BASE_URL=http://localhost:4112
```

- [ ] **Step 5: Verify typecheck still passes**

Run: `cd apps/ui && bun run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/package.json apps/ui/.env.example bun.lock
git commit -m "chore(ui): add @mastra/client-js dependency"
```

---

## Task 2: Align the `Transaction` type to the agent

The agent's `transactionSchema` stores `amount` as a positive number and `date` as `yyyy-MM-dd`. The UI type used a "negative = expense" convention. Align the UI type so agent payloads slot in directly.

**Files:**
- Modify: `apps/ui/src/transactions/domain/transaction.ts`
- Modify: `apps/ui/src/transactions/components/transaction-row.tsx:36`
- Modify: `apps/ui/src/chat/repositories/mock-data.ts`

- [ ] **Step 1: Rewrite `transaction.ts`**

```typescript
import type { Category } from '@/shared/theme/tokens';

export type Transaction = {
  id: string;
  date: string; // yyyy-MM-dd (date-only), matches the agent
  amount: number; // ARS, positive — every transaction is an expense
  currency: 'ARS';
  category: Category | string;
  description: string;
  merchant: string;
};
```

- [ ] **Step 2: Drop `signed` from `TransactionRow`**

In `transaction-row.tsx`, change the `<Num>` line so it no longer passes `signed` (amounts are positive expenses, shown without a sign):

```tsx
        <Num value={amount} size="sm" />
```

- [ ] **Step 3: Remove the amount negation in `mock-data.ts`**

In `mock-data.ts`, the `MOCK_TRANSACTIONS` map negated amounts. Replace the mapping and its comment so amounts stay positive:

```typescript
/**
 * Mock transactions sourced from the real `data/transactions.json` dataset.
 * The dataset and the domain `Transaction` contract both store expenses as
 * positive integers, so amounts pass through unchanged.
 */
export const MOCK_TRANSACTIONS: Transaction[] = (rawTransactions as RawTransaction[]).map(
  (raw): Transaction => ({
    id: raw.id,
    date: raw.date,
    amount: raw.amount,
    currency: raw.currency,
    category: raw.category,
    description: raw.description,
    merchant: raw.merchant,
  }),
);
```

- [ ] **Step 4: Verify typecheck**

Run: `cd apps/ui && bun run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/transactions apps/ui/src/chat/repositories/mock-data.ts
git commit -m "refactor(ui): align Transaction type to the agent shape"
```

---

## Task 3: Align the `BudgetProgress` type to the agent

The agent's `getBudgetProgress` tool emits items shaped `{ category, budget, spent, remaining, pace, projected }`. Align the UI type.

**Files:**
- Modify: `apps/ui/src/budgets/domain/budget-progress.ts`
- Modify: `apps/ui/src/budgets/providers/budget-state.ts:7`
- Modify: `apps/ui/src/chat/repositories/mock-data.ts`

- [ ] **Step 1: Rewrite `budget-progress.ts`**

```typescript
import type { Category } from '@/shared/theme/tokens';

export type BudgetProgress = {
  category: Category | string;
  budget: number;    // ARS — monthly budget
  spent: number;     // ARS — spent so far this month
  remaining: number; // ARS — budget minus spent
  pace: 'under' | 'on' | 'over'; // on-track-at-pace status
  projected: number; // ARS — projected total spend by end of month
};
```

- [ ] **Step 2: Update `budget-state.ts` to use `projected`**

In `resolveBudgetTone`, replace `progress.projection` with `progress.projected`:

```typescript
export function resolveBudgetTone(progress: BudgetProgress): BudgetTone {
  if (progress.budget <= 0) return 'pos';
  const ratio = progress.projected / progress.budget;
  if (ratio <= 0.85) return 'pos';
  if (ratio <= 1.0) return 'warn';
  return 'neg';
}
```

`resolveBudgetFraction` is unchanged (it uses `spent` and `budget`).

- [ ] **Step 3: Update `MOCK_COMIDA_BUDGET` in `mock-data.ts`**

Replace the export at the bottom of `mock-data.ts`:

```typescript
export const MOCK_COMIDA_BUDGET: BudgetProgress = {
  category: 'comida',
  budget: 80000,
  spent: 54000,
  remaining: 26000,
  pace: 'over',
  projected: 92000,
};
```

- [ ] **Step 4: Verify typecheck**

Run: `cd apps/ui && bun run typecheck`
Expected: no errors. (`BudgetProgressCard` reads only `spent`, `budget`, and the `caption` prop — it needs no change.)

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/budgets apps/ui/src/chat/repositories/mock-data.ts
git commit -m "refactor(ui): align BudgetProgress type to the agent shape"
```

---

## Task 4: Add chat session identity

A constant `resourceId` and a `localStorage`-persisted `threadId`, so agent memory persists across page reloads.

**Files:**
- Create: `apps/ui/src/chat/infrastructure/chat-session.ts`

- [ ] **Step 1: Create `chat-session.ts`**

```typescript
/**
 * Chat session identity for the Mastra agent's memory.
 * `resourceId` is fixed (single-user app, matches the agent server middleware).
 * `threadId` is generated once and persisted in localStorage so a page reload
 * keeps the same conversation thread.
 */

export const RESOURCE_ID = 'default-user';

const THREAD_STORAGE_KEY = 'gasti.thread';

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Returns the persisted thread id, creating and storing one on first use. */
export function getThreadId(): string {
  if (typeof window === 'undefined') return randomId(); // SSR: throwaway, never reached client-side
  const existing = window.localStorage.getItem(THREAD_STORAGE_KEY);
  if (existing) return existing;
  const fresh = randomId();
  window.localStorage.setItem(THREAD_STORAGE_KEY, fresh);
  return fresh;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/ui && bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/infrastructure/chat-session.ts
git commit -m "feat(ui): add chat session identity helper"
```

---

## Task 5: Add the Mastra → ReplyEvent mapper

A stateful mapper fed one Mastra chunk at a time. It accumulates text, tool calls, and attachments, and emits `ReplyEvent`s.

**Files:**
- Create: `apps/ui/src/chat/providers/mastra-stream-mapper.ts`

- [ ] **Step 1: Create `mastra-stream-mapper.ts`**

```typescript
import type { ReplyEvent } from '@/chat/domain/chat-repository';
import type { GastiMessage, MessageAttachment, ToolCall } from '@/chat/domain/message';

/** A Mastra stream chunk: `{ type, payload }`. Payload shape varies by type. */
export type MastraChunk = { type: string; payload?: Record<string, unknown> };

const ATTACHMENT_KINDS = new Set(['transactionList', 'budgetProgress', 'optionPills']);

/**
 * A tool's display payload is already attachment-shaped (the agent's tools use
 * Mastra `transform.display.output`). Pass it through when its `kind` is known.
 */
function toAttachment(result: unknown): MessageAttachment | null {
  if (result && typeof result === 'object' && 'kind' in result) {
    const kind = (result as { kind: unknown }).kind;
    if (typeof kind === 'string' && ATTACHMENT_KINDS.has(kind)) {
      return result as MessageAttachment;
    }
  }
  return null;
}

type ChunkPayload = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/**
 * Builds a stateful mapper. Feed every Mastra chunk to `onChunk`; call `end`
 * once the stream finishes. Both return `ReplyEvent`s ready to forward.
 */
export function createReplyEventMapper(makeId: () => string, now: () => Date) {
  let started = false;
  let text = '';
  let errorText: string | null = null;
  const toolCalls: ToolCall[] = [];
  const attachments: MessageAttachment[] = [];

  function onChunk(chunk: MastraChunk): ReplyEvent[] {
    const events: ReplyEvent[] = [];
    if (!started) {
      started = true;
      events.push({ kind: 'thinking' });
    }
    const payload: ChunkPayload = chunk.payload ?? {};

    switch (chunk.type) {
      case 'tool-call': {
        const call: ToolCall = {
          id: str(payload.toolCallId) || makeId(),
          name: str(payload.toolName),
          inputs: rec(payload.args),
        };
        toolCalls.push(call);
        events.push({ kind: 'toolCall', call });
        break;
      }
      case 'tool-result': {
        const attachment = toAttachment(payload.result);
        if (attachment) attachments.push(attachment);
        break;
      }
      case 'text-delta': {
        const delta = str(payload.text);
        if (delta) {
          text += delta;
          events.push({ kind: 'partial', text: delta });
        }
        break;
      }
      case 'error':
      case 'tool-error': {
        errorText = 'No pude completar la consulta en este momento.';
        break;
      }
    }
    return events;
  }

  function end(): ReplyEvent[] {
    const message: GastiMessage = {
      id: makeId(),
      role: 'gasti',
      text: errorText ?? text,
      sentAt: now().toISOString(),
      ...(toolCalls.length ? { toolCalls } : {}),
      ...(attachments.length ? { attachments } : {}),
    };
    return [{ kind: 'final', message }];
  }

  return { onChunk, end };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/ui && bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/providers/mastra-stream-mapper.ts
git commit -m "feat(ui): add Mastra-chunk to ReplyEvent mapper"
```

> **Implementation note for the next task:** if a manual run later shows tool
> attachments not rendering, the `tool-result` chunk is carrying raw tool output
> instead of the display payload. The fix is local to `toAttachment`: mirror the
> three pure `transform` functions from `apps/ai` (`listTransactions`,
> `getBudgetProgress`, `proposeTransactionMutation`). Not expected per the Mastra
> docs ("display transforms apply to streamed UI payloads").

---

## Task 6: Add the `/api/chat` route handler

The anti-corruption layer: calls the agent server-side, maps chunks, streams NDJSON.

**Files:**
- Create: `apps/ui/app/api/chat/route.ts`

- [ ] **Step 1: Create `route.ts`**

```typescript
import { MastraClient } from '@mastra/client-js';
import { createReplyEventMapper, type MastraChunk } from '@/chat/providers/mastra-stream-mapper';
import type { ReplyEvent } from '@/chat/domain/chat-repository';

export const runtime = 'nodejs';

const MASTRA_BASE_URL = process.env.MASTRA_BASE_URL ?? 'http://localhost:4112';

type ChatRequest = { text: string; threadId: string; resourceId: string };

function errorFinal(): ReplyEvent {
  return {
    kind: 'final',
    message: {
      id: crypto.randomUUID(),
      role: 'gasti',
      text: 'No pude conectarme con Gasti en este momento. Probá de nuevo en un rato.',
      sentAt: new Date().toISOString(),
    },
  };
}

export async function POST(req: Request): Promise<Response> {
  const { text, threadId, resourceId } = (await req.json()) as ChatRequest;
  const encoder = new TextEncoder();
  const mapper = createReplyEventMapper(() => crypto.randomUUID(), () => new Date());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ReplyEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const client = new MastraClient({ baseUrl: MASTRA_BASE_URL });
        const agent = client.getAgent('gasti');
        const response = await agent.stream(text, {
          memory: { thread: threadId, resource: resourceId },
        });
        await response.processDataStream({
          onChunk: (chunk: MastraChunk) => {
            for (const event of mapper.onChunk(chunk)) emit(event);
          },
        });
        for (const event of mapper.end()) emit(event);
      } catch {
        emit(errorFinal());
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/ui && bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/app/api/chat/route.ts
git commit -m "feat(ui): add /api/chat route handler bridging to the agent"
```

---

## Task 7: Add `AgentChatRepository`

A `ChatRepository` implementation that POSTs to `/api/chat` and parses the NDJSON stream into `ReplyEvent`s.

**Files:**
- Create: `apps/ui/src/chat/repositories/agent-chat-repository.ts`

- [ ] **Step 1: Create `agent-chat-repository.ts`**

```typescript
import type { ChatRepository, ReplyEvent } from '@/chat/domain/chat-repository';
import type { Conversation } from '@/chat/domain/conversation';
import type { Message } from '@/chat/domain/message';
import { getThreadId, RESOURCE_ID } from '@/chat/infrastructure/chat-session';

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function errorFinal(): ReplyEvent {
  return {
    kind: 'final',
    message: {
      id: makeId(),
      role: 'gasti',
      text: 'No pude conectarme con Gasti en este momento. Probá de nuevo en un rato.',
      sentAt: new Date().toISOString(),
    },
  };
}

/**
 * Resolves the natural-language text for a picked option pill. The agent has no
 * concept of pills — confirming a mutation is just the user's next text turn.
 */
function resolveOptionLabel(optionId: string, history: Message[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== 'gasti' || !m.attachments) continue;
    for (const a of m.attachments) {
      if (a.kind !== 'optionPills') continue;
      const option = a.options.find((o) => o.id === optionId);
      if (option) return option.label;
    }
  }
  return optionId === 'cancel' ? 'Cancelar' : 'Sí, confirmá';
}

export class AgentChatRepository implements ChatRepository {
  async loadInitial(): Promise<Conversation> {
    return { id: 'conv-1', messages: [], startedAt: new Date().toISOString() };
  }

  reply(input: { text: string; history: Message[] }): AsyncIterable<ReplyEvent> {
    return this.#stream(input.text);
  }

  confirmOption(input: { optionId: string; history: Message[] }): AsyncIterable<ReplyEvent> {
    return this.#stream(resolveOptionLabel(input.optionId, input.history));
  }

  async *#stream(text: string): AsyncIterable<ReplyEvent> {
    let response: Response;
    try {
      response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, threadId: getThreadId(), resourceId: RESOURCE_ID }),
      });
    } catch {
      yield errorFinal();
      return;
    }

    if (!response.ok || !response.body) {
      yield errorFinal();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) yield JSON.parse(line) as ReplyEvent;
        }
      }
      if (buffer.trim()) yield JSON.parse(buffer) as ReplyEvent;
    } catch {
      yield errorFinal();
    }
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/ui && bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/repositories/agent-chat-repository.ts
git commit -m "feat(ui): add AgentChatRepository backed by /api/chat"
```

---

## Task 8: Add the streaming path to the reducer

The reducer gains a `streamingMessage` — the in-progress Gasti reply assembled from `partial` and `toolCall` events.

**Files:**
- Modify: `apps/ui/src/chat/infrastructure/chat-reducer.ts`

- [ ] **Step 1: Rewrite `chat-reducer.ts`**

```typescript
import type { GastiMessage, Message, MessageAttachment, ToolCall, UserMessage } from '@/chat/domain/message';

export type ChatStatus = 'idle' | 'thinking';

export type ChatState = {
  messages: Message[];
  status: ChatStatus;
  /** The Gasti reply being streamed in; null when no reply is in flight. */
  streamingMessage: GastiMessage | null;
};

export const initialChatState: ChatState = {
  messages: [],
  status: 'idle',
  streamingMessage: null,
};

export type ChatAction =
  | { type: 'APPEND_USER'; message: UserMessage }
  | { type: 'SET_THINKING' }
  | { type: 'ADD_TOOL_CALL_TO_PENDING'; call: ToolCall }
  | { type: 'APPEND_PARTIAL'; text: string }
  | { type: 'APPEND_GASTI'; message: GastiMessage }
  | { type: 'RESOLVE_LAST_OPTIONS' }
  | { type: 'RESET' };

/** Starts a fresh in-progress Gasti message. */
function emptyStreaming(): GastiMessage {
  return {
    id: `streaming_${Date.now()}`,
    role: 'gasti',
    text: '',
    toolCalls: [],
    sentAt: new Date().toISOString(),
  };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'APPEND_USER':
      return { ...state, messages: [...state.messages, action.message] };

    case 'SET_THINKING':
      return { ...state, status: 'thinking' };

    case 'ADD_TOOL_CALL_TO_PENDING': {
      const base = state.streamingMessage ?? emptyStreaming();
      return {
        ...state,
        streamingMessage: {
          ...base,
          toolCalls: [...(base.toolCalls ?? []), action.call],
        },
      };
    }

    case 'APPEND_PARTIAL': {
      const base = state.streamingMessage ?? emptyStreaming();
      return {
        ...state,
        streamingMessage: { ...base, text: base.text + action.text },
      };
    }

    case 'APPEND_GASTI':
      return {
        ...state,
        messages: [...state.messages, action.message],
        status: 'idle',
        streamingMessage: null,
      };

    case 'RESOLVE_LAST_OPTIONS': {
      const next = [...state.messages];
      for (let i = next.length - 1; i >= 0; i--) {
        const m = next[i];
        if (m.role !== 'gasti' || !m.attachments) continue;
        const lastIdx = m.attachments.findIndex((a) => a.kind === 'optionPills' && !a.resolved);
        if (lastIdx === -1) continue;
        const updatedAttachments: MessageAttachment[] = m.attachments.map((a, idx) =>
          idx === lastIdx && a.kind === 'optionPills' ? { ...a, resolved: true } : a,
        );
        next[i] = { ...m, attachments: updatedAttachments };
        break;
      }
      return { ...state, messages: next };
    }

    case 'RESET':
      return initialChatState;
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/ui && bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/infrastructure/chat-reducer.ts
git commit -m "feat(ui): add streaming-message path to the chat reducer"
```

---

## Task 9: Wire `AgentChatRepository` and streaming into the provider and screen

Swap the repository, handle `partial`, and render the streaming message.

**Files:**
- Modify: `apps/ui/src/chat/infrastructure/chat-context.tsx`
- Modify: `apps/ui/src/chat/components/chat-screen.tsx`

- [ ] **Step 1: Update `chat-context.tsx`**

Replace the `MockChatRepository` import and the `repo` line, expose `streamingMessage`, and handle `APPEND_PARTIAL`.

Change the import:

```tsx
import { AgentChatRepository } from '@/chat/repositories/agent-chat-repository';
```

Change the `ChatContextValue` type to expose the streaming message:

```tsx
export type ChatContextValue = ChatState & {
  sendMessage: (text: string) => Promise<void>;
  pickOption: (optionId: string) => Promise<void>;
};
```

Change the `repo` memo:

```tsx
  const repo = useMemo(() => new AgentChatRepository(), []);
```

In **both** the `sendMessage` and `pickOption` event loops, replace the empty `partial` case with a dispatch:

```tsx
          case 'partial':
            dispatch({ type: 'APPEND_PARTIAL', text: ev.text });
            break;
```

(The `ChatState` already carries `streamingMessage`, so `{ ...state, sendMessage, pickOption }` exposes it through the context value with no further change.)

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/ui && bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Render the streaming message in `chat-screen.tsx`**

Pull `streamingMessage` from `useChat()` and append it to the thread; show the thinking indicator only before the first token arrives.

```tsx
export function ChatScreen() {
  const { messages, status, streamingMessage, sendMessage } = useChat();
  const isEmpty = messages.length === 0;
  const composerState = status === 'thinking' ? 'thinking' : 'idle';
  const threadMessages = streamingMessage ? [...messages, streamingMessage] : messages;

  return (
    <>
      <MeshBackground visible={isEmpty} />
      <div className="relative flex min-h-screen flex-col">
        <Header variant={isEmpty ? 'frosted' : 'solid'} />

        <main className="flex-1 mx-auto w-full max-w-[720px] px-s4 sm:px-s6 lg:px-s7 pb-[100px]">
          {isEmpty ? (
            <LandingHero />
          ) : (
            <ConversationThread
              messages={threadMessages}
              pending={status === 'thinking' && streamingMessage === null}
            />
          )}
        </main>

        <div
          className={[
            'pointer-events-none fixed inset-x-0 bottom-0 z-10 pt-s8',
            isEmpty ? '' : 'bg-gradient-to-t from-surface-1 via-surface-1 to-transparent',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="mx-auto w-full max-w-[720px] px-s4 sm:px-s6 lg:px-s7 pb-s5">
            <div className="pointer-events-auto">
              <Composer
                onSubmit={(text) => void sendMessage(text)}
                state={composerState}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Verify typecheck**

Run: `cd apps/ui && bun run typecheck`
Expected: no errors.

- [ ] **Step 5: Manual end-to-end verification**

Start all three apps from the repo root: `bun dev` (or `bun dev --filter=api --filter=ai --filter=ui`).
Open `http://localhost:3000` and verify:
1. Sending "¿Cuánto gasté en comida este mes?" streams a reply token by token.
2. The `ThinkingIndicator` shows before the first token, then the streaming message takes over.
3. A tool-call trace appears live while the agent works.
4. A query that lists transactions renders a `transactionList` card.
5. Reloading the page and asking a follow-up shows the agent remembers context (memory thread persisted).
6. Stopping `apps/ai` and sending a message shows the honest "No pude conectarme" reply, not a crash.

- [ ] **Step 6: Build verification**

Run: `cd apps/ui && bun run build`
Expected: the production build completes without error.

- [ ] **Step 7: Commit**

```bash
git add apps/ui/src/chat/infrastructure/chat-context.tsx apps/ui/src/chat/components/chat-screen.tsx
git commit -m "feat(ui): wire the chat to the live Gasti agent"
```

---

## Self-Review

**Spec coverage:**
- BFF route handler — Task 6. ✅
- Full streaming (`partial`) — Tasks 8, 9. ✅
- Attachments synthesized from tool display payloads — Task 5 (`toAttachment`). ✅
- Memory threading (fixed resource + persisted thread) — Task 4, used in Task 7. ✅
- Anti-corruption layer (mapper) — Task 5, used in Task 6. ✅
- Data-shape alignment — Tasks 2, 3. ✅
- Confirm / option-pill flow — Task 7 (`resolveOptionLabel`). ✅
- `MockChatRepository` kept — never deleted; only `mock-data.ts` adjusted. ✅
- Error handling (unreachable, broken stream) — Tasks 6, 7 (`errorFinal`). ✅
- Env + dependency — Task 1. ✅

**Type consistency:** `ReplyEvent` (from `chat-repository.ts`) is used unchanged across Tasks 5–9. `MastraChunk` is defined in Task 5 and imported in Task 6. `getThreadId` / `RESOURCE_ID` defined in Task 4, imported in Task 7. `streamingMessage` added to `ChatState` in Task 8, consumed in Task 9. `ChatAction` gains `APPEND_PARTIAL` in Task 8, dispatched in Task 9. Consistent.

**Placeholder scan:** no TBD/TODO. The `toAttachment` fallback note after Task 5 is a bounded, documented contingency with a concrete fix location — not a placeholder.
