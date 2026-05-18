# Thread Persistence & Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a refreshed page's chat thread from the Mastra agent's memory while keeping the landing screen visible until the user's first message, then fade into the loaded conversation.

**Architecture:** A new `GET /api/chat` route reads the thread from `MastraClient` server-side; a history mapper rebuilds the UI's rich `Message[]` (text, tool calls, transaction/budget/pill attachments) from the persisted v2 message parts, reusing the existing tool→attachment logic extracted into a shared provider. The reducer gains a `view` flag so landing-vs-conversation no longer depends on message count; `ChatProvider` loads history on mount; `ChatScreen` cross-fades landing into the conversation.

**Tech Stack:** Next.js 15 App Router, React 19, `@mastra/client-js`, TypeScript, Tailwind 3.

**Spec:** `docs/superpowers/specs/2026-05-18-thread-persistence-restore-design.md`

**Note on tests:** `apps/ui` has no test harness. Tasks verify with `tsc --noEmit` (typecheck) plus manual verification in the final task — there are no RED/GREEN unit-test steps.

**Confirmed data shape (from `apps/ai/.gasti/mastra.db`):** persisted messages store `content` as a v2 object `{ format: 2, parts: [...], content: "..." }`. Parts seen: `{ type: 'text', text }`, `{ type: 'tool-invocation', toolInvocation: { state, toolCallId, toolName, args, result } }`, `{ type: 'step-start' }`. `MastraClient.getMemoryThread().listMessages()` returns these messages with `content` already parsed to an object.

---

### Task 1: Extract shared tool-result → attachment provider

The tool→attachment mapping currently lives inside `mastra-stream-mapper.ts`. Extract it so the new history mapper can reuse the exact same logic (DRY).

**Files:**
- Create: `apps/ui/src/chat/providers/tool-result-attachment.ts`
- Modify: `apps/ui/src/chat/providers/mastra-stream-mapper.ts`

- [ ] **Step 1: Create the shared provider**

Create `apps/ui/src/chat/providers/tool-result-attachment.ts` with the exact content below (moved verbatim from the stream mapper, with `str`/`rec`/`toAttachment` now exported):

```ts
import type { MessageAttachment } from '@/chat/domain/message';
import type { Transaction } from '@/transactions/domain/transaction';
import type { BudgetProgress } from '@/budgets/domain/budget-progress';

/** Coerces an unknown value to a string, defaulting to ''. */
export const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Coerces an unknown value to a record, defaulting to {}. */
export const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

const ATTACHMENT_KINDS = new Set(['transactionList', 'budgetProgress', 'optionPills']);

/** A payload that already carries a known attachment `kind` — pass it through. */
function asDisplayAttachment(result: unknown): MessageAttachment | null {
  if (result && typeof result === 'object' && 'kind' in result) {
    const kind = (result as { kind: unknown }).kind;
    if (typeof kind === 'string' && ATTACHMENT_KINDS.has(kind)) {
      return result as MessageAttachment;
    }
  }
  return null;
}

/**
 * Maps a tool's result output to a UI attachment. Mastra streams the raw tool
 * output (not the agent's `transform.display` payload), and the same raw output
 * is what gets persisted in memory — so this one mapping serves both the live
 * stream mapper and the history mapper. A gateway error envelope
 * (`{ error: true }`) yields no attachment.
 */
export function toAttachment(toolName: string, result: unknown): MessageAttachment | null {
  const direct = asDisplayAttachment(result);
  if (direct) return direct;

  const r = rec(result);
  if (r.error === true) return null;

  switch (toolName) {
    case 'listTransactions': {
      const items = Array.isArray(r.transactions) ? (r.transactions as Transaction[]) : [];
      return items.length ? { kind: 'transactionList', items } : null;
    }
    case 'getBudgetProgress': {
      const items = Array.isArray(r.items) ? r.items : [];
      const progress = items[0] as BudgetProgress | undefined;
      return progress ? { kind: 'budgetProgress', progress } : null;
    }
    case 'proposeTransactionMutation': {
      const matches = Array.isArray(r.matches) ? (r.matches as Transaction[]) : [];
      const intent = str(r.intent);
      if (matches.length === 1) {
        const confirmLabel = intent === 'delete' ? 'Sí, borralo' : 'Sí, guardá los cambios';
        return {
          kind: 'optionPills',
          options: [
            { id: `confirm:${intent}:${matches[0].id}`, label: confirmLabel, intent: 'confirm' },
            { id: 'cancel', label: 'Cancelar', intent: 'cancel' },
          ],
        };
      }
      return matches.length ? { kind: 'transactionList', items: matches } : null;
    }
    default:
      return null;
  }
}
```

- [ ] **Step 2: Update the stream mapper to consume the provider**

Replace `apps/ui/src/chat/providers/mastra-stream-mapper.ts` entirely with:

```ts
import type { ReplyEvent } from '@/chat/domain/chat-repository';
import type { GastiMessage, MessageAttachment, ToolCall } from '@/chat/domain/message';
import { rec, str, toAttachment } from '@/chat/providers/tool-result-attachment';

/**
 * A Mastra stream chunk: `{ type, payload }`. `payload` is `unknown` so that
 * `@mastra/client-js`'s concretely-typed `ChunkType` union is assignable here
 * (its typed payloads have no string index signature). The mapper narrows
 * `payload` per chunk via the `rec()` helper.
 */
export type MastraChunk = { type: string; payload?: unknown };

type ChunkPayload = Record<string, unknown>;

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
    const payload: ChunkPayload = rec(chunk.payload);

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
        const attachment = toAttachment(str(payload.toolName), payload.result);
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

- [ ] **Step 3: Typecheck**

Run: `cd apps/ui && bun run typecheck`
Expected: completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/chat/providers/tool-result-attachment.ts apps/ui/src/chat/providers/mastra-stream-mapper.ts
git commit -m "refactor: extract shared tool-result attachment provider"
```

---

### Task 2: History message mapper

Convert persisted Mastra messages into the UI's rich `Message[]` shape.

**Files:**
- Create: `apps/ui/src/chat/providers/history-message-mapper.ts`

- [ ] **Step 1: Create the history mapper**

Create `apps/ui/src/chat/providers/history-message-mapper.ts`:

```ts
import type { GastiMessage, Message, MessageAttachment, ToolCall, UserMessage } from '@/chat/domain/message';
import { rec, str, toAttachment } from '@/chat/providers/tool-result-attachment';

/** A message part as persisted by Mastra memory (v2 format). */
type PersistedPart = {
  type: string;
  text?: string;
  toolInvocation?: {
    toolCallId?: string;
    toolName?: string;
    args?: unknown;
    result?: unknown;
    state?: string;
  };
};

/** A message as returned by `MastraClient` `listMessages()`. */
export type PersistedMessage = {
  id: string;
  role: string;
  createdAt?: string | number | Date;
  content?: { parts?: PersistedPart[] } | string | null;
};

/** Normalizes any timestamp into an ISO string, falling back to now. */
function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

/** Extracts the parts array from a persisted message's content. */
function partsOf(content: PersistedMessage['content']): PersistedPart[] {
  if (content && typeof content === 'object' && Array.isArray(content.parts)) {
    return content.parts;
  }
  return [];
}

function mapUserMessage(m: PersistedMessage): UserMessage {
  const text = partsOf(m.content)
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('');
  return { id: m.id, role: 'user', text, sentAt: toIso(m.createdAt) };
}

function mapGastiMessage(m: PersistedMessage): GastiMessage {
  let text = '';
  const toolCalls: ToolCall[] = [];
  const attachments: MessageAttachment[] = [];

  for (const part of partsOf(m.content)) {
    if (part.type === 'text') {
      text += part.text ?? '';
      continue;
    }
    if (part.type === 'tool-invocation') {
      const ti = rec(part.toolInvocation);
      const name = str(ti.toolName);
      toolCalls.push({
        id: str(ti.toolCallId) || `${m.id}-tool-${toolCalls.length}`,
        name,
        inputs: rec(ti.args),
      });
      const attachment = toAttachment(name, ti.result);
      if (attachment) {
        // Restored pills are history, not live actions.
        attachments.push(
          attachment.kind === 'optionPills' ? { ...attachment, resolved: true } : attachment,
        );
      }
    }
  }

  return {
    id: m.id,
    role: 'gasti',
    text,
    sentAt: toIso(m.createdAt),
    ...(toolCalls.length ? { toolCalls } : {}),
    ...(attachments.length ? { attachments } : {}),
  };
}

/** Converts persisted Mastra messages into the UI's rich `Message[]` shape. */
export function mapHistoryToMessages(persisted: PersistedMessage[]): Message[] {
  return persisted.map((m) => (m.role === 'user' ? mapUserMessage(m) : mapGastiMessage(m)));
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/ui && bun run typecheck`
Expected: completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/providers/history-message-mapper.ts
git commit -m "feat: add history message mapper for restored threads"
```

---

### Task 3: `GET /api/chat` route

Add a GET handler that fetches and maps the persisted thread.

**Files:**
- Modify: `apps/ui/app/api/chat/route.ts`

- [ ] **Step 1: Add the GET handler**

In `apps/ui/app/api/chat/route.ts`, add this import near the top (after the existing imports):

```ts
import { mapHistoryToMessages, type PersistedMessage } from '@/chat/providers/history-message-mapper';
```

Then append this handler at the end of the file (after the existing `POST` function):

```ts
/**
 * Restores a persisted thread. Returns the agent's stored conversation mapped to
 * the UI's rich `Message[]` shape. Never throws to the client — a missing thread
 * or any failure yields an empty conversation.
 */
export async function GET(req: Request): Promise<Response> {
  const threadId = new URL(req.url).searchParams.get('threadId') ?? '';
  if (!threadId) return Response.json({ messages: [] });

  try {
    const client = new MastraClient({ baseUrl: MASTRA_BASE_URL });
    const thread = client.getMemoryThread({ threadId, agentId: 'gasti' });
    const result = await thread.listMessages();
    const persisted = (result?.messages ?? []) as PersistedMessage[];
    return Response.json({ messages: mapHistoryToMessages(persisted) });
  } catch {
    return Response.json({ messages: [] });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/ui && bun run typecheck`
Expected: completes with no errors.

If `client.getMemoryThread` or `thread.listMessages` reports a type error, the
installed `@mastra/client-js` API differs from the documented form. Check the
method shape with `cd apps/ui && bun -e "import('@mastra/client-js').then(m => console.log(Object.getOwnPropertyNames(m.MastraClient.prototype)))"` and adjust the call (e.g. `getMemoryThread(threadId, 'gasti')` positional form, or `listMessages` vs `getMessages`). The mapper input (`PersistedMessage[]`) stays the same.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/app/api/chat/route.ts
git commit -m "feat: add GET /api/chat to restore persisted thread"
```

---

### Task 4: Wire `loadInitial()` to the new route

`AgentChatRepository.loadInitial()` returns a hardcoded empty array. Make it fetch.

**Files:**
- Modify: `apps/ui/src/chat/repositories/agent-chat-repository.ts:43-45`

- [ ] **Step 1: Replace `loadInitial`**

In `apps/ui/src/chat/repositories/agent-chat-repository.ts`, replace the existing `loadInitial` method (currently lines 43-45):

```ts
  async loadInitial(): Promise<Conversation> {
    return { id: 'conv-1', messages: [], startedAt: new Date().toISOString() };
  }
```

with:

```ts
  async loadInitial(): Promise<Conversation> {
    const startedAt = new Date().toISOString();
    try {
      const params = new URLSearchParams({ threadId: getThreadId() });
      const response = await fetch(`/api/chat?${params}`);
      if (!response.ok) return { id: 'conv-1', messages: [], startedAt };
      const data = (await response.json()) as { messages: Message[] };
      return { id: 'conv-1', messages: data.messages ?? [], startedAt };
    } catch {
      return { id: 'conv-1', messages: [], startedAt };
    }
  }
```

(`getThreadId`, `Conversation`, and `Message` are already imported in this file.)

- [ ] **Step 2: Typecheck**

Run: `cd apps/ui && bun run typecheck`
Expected: completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/repositories/agent-chat-repository.ts
git commit -m "feat: load persisted thread in AgentChatRepository.loadInitial"
```

---

### Task 5: Reducer — `view`, `HYDRATE_HISTORY`, `ENTER_CONVERSATION`

Decouple landing-vs-conversation from message count.

**Files:**
- Modify: `apps/ui/src/chat/infrastructure/chat-reducer.ts`

- [ ] **Step 1: Extend `ChatState` and `initialChatState`**

In `apps/ui/src/chat/infrastructure/chat-reducer.ts`, replace the `ChatState` type and `initialChatState` (currently lines 5-16):

```ts
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
```

with:

```ts
export type ChatState = {
  messages: Message[];
  status: ChatStatus;
  /** The Gasti reply being streamed in; null when no reply is in flight. */
  streamingMessage: GastiMessage | null;
  /**
   * Which screen to show. Starts on the landing hero even when `messages` is
   * already populated from a restored thread; flips to 'conversation' on the
   * user's first message this session.
   */
  view: 'landing' | 'conversation';
};

export const initialChatState: ChatState = {
  messages: [],
  status: 'idle',
  streamingMessage: null,
  view: 'landing',
};
```

- [ ] **Step 2: Add the two actions to the `ChatAction` union**

Replace the `ChatAction` union (currently lines 18-25):

```ts
export type ChatAction =
  | { type: 'APPEND_USER'; message: UserMessage }
  | { type: 'SET_THINKING' }
  | { type: 'ADD_TOOL_CALL_TO_PENDING'; call: ToolCall }
  | { type: 'APPEND_PARTIAL'; text: string }
  | { type: 'APPEND_GASTI'; message: GastiMessage }
  | { type: 'RESOLVE_LAST_OPTIONS' }
  | { type: 'RESET' };
```

with:

```ts
export type ChatAction =
  | { type: 'APPEND_USER'; message: UserMessage }
  | { type: 'SET_THINKING' }
  | { type: 'ADD_TOOL_CALL_TO_PENDING'; call: ToolCall }
  | { type: 'APPEND_PARTIAL'; text: string }
  | { type: 'APPEND_GASTI'; message: GastiMessage }
  | { type: 'RESOLVE_LAST_OPTIONS' }
  | { type: 'HYDRATE_HISTORY'; messages: Message[] }
  | { type: 'ENTER_CONVERSATION' }
  | { type: 'RESET' };
```

- [ ] **Step 3: Handle the two actions in the reducer**

In the `chatReducer` switch, add these two cases immediately before the `case 'RESET':` line:

```ts
    case 'HYDRATE_HISTORY':
      return { ...state, messages: action.messages };

    case 'ENTER_CONVERSATION':
      return state.view === 'conversation' ? state : { ...state, view: 'conversation' };

```

- [ ] **Step 4: Typecheck**

Run: `cd apps/ui && bun run typecheck`
Expected: completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/chat/infrastructure/chat-reducer.ts
git commit -m "feat: add view flag and history actions to chat reducer"
```

---

### Task 6: `ChatProvider` — load history on mount

Wire the `loadInitialConversation` use-case and dispatch the new actions.

**Files:**
- Modify: `apps/ui/src/chat/infrastructure/chat-context.tsx`

- [ ] **Step 1: Replace the file**

Replace `apps/ui/src/chat/infrastructure/chat-context.tsx` entirely with:

```tsx
'use client';

import { createContext, useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { chatReducer, initialChatState, type ChatState } from '@/chat/infrastructure/chat-reducer';
import { AgentChatRepository } from '@/chat/repositories/agent-chat-repository';
import { makeSendUserMessage } from '@/chat/use-cases/send-user-message';
import { makeConfirmMutation } from '@/chat/use-cases/confirm-mutation';
import { makeLoadInitialConversation } from '@/chat/use-cases/load-initial-conversation';

export type ChatContextValue = ChatState & {
  sendMessage: (text: string) => Promise<void>;
  pickOption: (optionId: string) => Promise<void>;
};

export const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const repo = useMemo(() => new AgentChatRepository(), []);
  const sendUserMessage = useMemo(() => makeSendUserMessage({ repo }), [repo]);
  const confirmMutation = useMemo(() => makeConfirmMutation({ repo }), [repo]);
  const loadInitialConversation = useMemo(() => makeLoadInitialConversation({ repo }), [repo]);

  const [state, dispatch] = useReducer(chatReducer, initialChatState);

  // Restore the persisted thread once on mount. The promise is held in a ref so
  // the first send can await it — HYDRATE_HISTORY replaces `messages` wholesale,
  // so it must land before any APPEND_USER or the new message would be lost.
  const historyLoaded = useRef<Promise<void> | undefined>(undefined);
  useEffect(() => {
    historyLoaded.current = loadInitialConversation()
      .then((conv) => {
        dispatch({ type: 'HYDRATE_HISTORY', messages: conv.messages });
      })
      .catch(() => {});
  }, [loadInitialConversation]);

  const sendMessage = useCallback(
    async (text: string) => {
      await historyLoaded.current;
      dispatch({ type: 'ENTER_CONVERSATION' });
      // Typing a new message instead of picking a pill retires any open pills.
      dispatch({ type: 'RESOLVE_LAST_OPTIONS' });
      for await (const ev of sendUserMessage({ text, history: state.messages })) {
        switch (ev.kind) {
          case 'appendUser':
            dispatch({ type: 'APPEND_USER', message: ev.message });
            break;
          case 'thinking':
            dispatch({ type: 'SET_THINKING' });
            break;
          case 'toolCall':
            dispatch({ type: 'ADD_TOOL_CALL_TO_PENDING', call: ev.call });
            break;
          case 'partial':
            dispatch({ type: 'APPEND_PARTIAL', text: ev.text });
            break;
          case 'final':
            dispatch({ type: 'APPEND_GASTI', message: ev.message });
            break;
        }
      }
    },
    [sendUserMessage, state.messages],
  );

  const pickOption = useCallback(
    async (optionId: string) => {
      await historyLoaded.current;
      dispatch({ type: 'ENTER_CONVERSATION' });
      for await (const ev of confirmMutation({ optionId, history: state.messages })) {
        switch (ev.kind) {
          case 'resolvePrevOptions':
            dispatch({ type: 'RESOLVE_LAST_OPTIONS' });
            break;
          case 'thinking':
            dispatch({ type: 'SET_THINKING' });
            break;
          case 'toolCall':
            dispatch({ type: 'ADD_TOOL_CALL_TO_PENDING', call: ev.call });
            break;
          case 'partial':
            dispatch({ type: 'APPEND_PARTIAL', text: ev.text });
            break;
          case 'final':
            dispatch({ type: 'APPEND_GASTI', message: ev.message });
            break;
        }
      }
    },
    [confirmMutation, state.messages],
  );

  const value = useMemo<ChatContextValue>(
    () => ({ ...state, sendMessage, pickOption }),
    [state, sendMessage, pickOption],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/ui && bun run typecheck`
Expected: completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/chat/infrastructure/chat-context.tsx
git commit -m "feat: restore persisted thread on ChatProvider mount"
```

---

### Task 7: `ChatScreen` — view-driven rendering and fade

Render by `view`, and cross-fade the landing into the conversation.

**Files:**
- Modify: `apps/ui/src/chat/components/chat-screen.tsx`

- [ ] **Step 1: Replace the file**

Replace `apps/ui/src/chat/components/chat-screen.tsx` entirely with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Composer } from '@/chat/components/composer';
import { ConversationThread } from '@/chat/components/conversation-thread';
import { Header } from '@/chat/components/header';
import { LandingHero } from '@/chat/components/landing-hero';
import { MeshBackground } from '@/shared/mesh/mesh-background';
import { useChat } from '@/chat/infrastructure/use-chat';

export function ChatScreen() {
  const { messages, status, streamingMessage, view, sendMessage } = useChat();
  const isLanding = view === 'landing';
  const composerState = status === 'thinking' ? 'thinking' : 'idle';
  const threadMessages = streamingMessage ? [...messages, streamingMessage] : messages;

  // Keep the landing hero mounted for one fade-out cycle after entering the
  // conversation, so it dissolves (480ms) instead of cutting out abruptly.
  const [landingMounted, setLandingMounted] = useState(true);
  useEffect(() => {
    if (isLanding) {
      setLandingMounted(true);
      return;
    }
    const timer = setTimeout(() => setLandingMounted(false), 480);
    return () => clearTimeout(timer);
  }, [isLanding]);

  return (
    <>
      <MeshBackground visible={isLanding} />
      <div className="relative flex min-h-screen flex-col">
        <Header variant={isLanding ? 'frosted' : 'solid'} />

        <main className="relative flex-1 mx-auto w-full max-w-[720px] px-s4 sm:px-s6 lg:px-s7 pb-[100px]">
          {!isLanding && (
            <ConversationThread
              messages={threadMessages}
              pending={status === 'thinking' && streamingMessage === null}
            />
          )}
          {landingMounted && (
            <div
              className={[
                'transition-opacity duration-slow ease-out',
                isLanding
                  ? 'opacity-100'
                  : 'pointer-events-none absolute inset-0 opacity-0',
              ].join(' ')}
            >
              <LandingHero />
            </div>
          )}
        </main>

        <div
          className={[
            'pointer-events-none fixed inset-x-0 bottom-0 z-10 pt-s8',
            isLanding ? '' : 'bg-gradient-to-t from-surface-1 via-surface-1 to-transparent',
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

- [ ] **Step 2: Typecheck**

Run: `cd apps/ui && bun run typecheck`
Expected: completes with no errors.

- [ ] **Step 3: Manual end-to-end verification**

Start the agent and the UI (two terminals, from repo root):

```bash
bun dev --filter=ai
bun dev --filter=ui
```

Then in a browser at `http://localhost:3000`:

1. Send a message that returns a transaction list (e.g. *"mostrame mis últimos gastos"*) and one that returns option pills (e.g. *"borrá el último gasto"* — do not confirm).
2. Refresh the page. **Expected:** the landing hero shows (not the conversation), mesh background visible.
3. Send any message. **Expected:** the landing fades out over ~480ms, the conversation appears already showing the full prior history — transaction list and budget cards intact, the old pills present but not clickable — followed by the new exchange.
4. Clear `localStorage` key `gasti.thread` (DevTools → Application) and refresh. **Expected:** landing shows; first send → clean conversation with only the new exchange, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/ui/src/chat/components/chat-screen.tsx
git commit -m "feat: keep landing on refresh, fade into restored conversation"
```

---

## Self-Review

**Spec coverage:**
- Restoration with full fidelity → Tasks 1 (shared mapper) + 2 (history mapper, rebuilds attachments, pills marked resolved). ✓
- `GET /api/chat` route → Task 3. ✓
- `loadInitial()` fetches → Task 4. ✓
- Reducer `view` / `HYDRATE_HISTORY` / `ENTER_CONVERSATION` → Task 5. ✓
- `ChatProvider` mount load + awaited promise ordering → Task 6. ✓
- `ChatScreen` view-driven render + fade → Task 7. ✓
- Error handling (route never throws, `loadInitial` degrades to empty, send awaits load) → Tasks 3, 4, 6. ✓
- Manual testing checklist → Task 7 Step 3. ✓
- Out of scope (reset action, pagination, test harness) → not implemented, as specified. ✓

**Type consistency:** `toAttachment`, `str`, `rec` exported by Task 1, imported by Tasks 1 (mapper) and 2. `PersistedMessage` / `mapHistoryToMessages` defined in Task 2, imported by Task 3. `HYDRATE_HISTORY` / `ENTER_CONVERSATION` / `view` defined in Task 5, used in Tasks 6 and 7. `loadInitial` returns `Conversation` (Task 4) consumed by `makeLoadInitialConversation` in Task 6. Names consistent across tasks. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete file or exact insertion. ✓
