# Thread persistence & restore

**Date:** 2026-05-18
**Status:** Approved — ready for planning

## Problem

The chat thread persists only halfway. `threadId` is kept in `localStorage`
(`gasti.thread`) and the Mastra agent stores the full conversation in its libsql
memory, keyed by `(resourceId, threadId)`. But the UI never re-reads that
history: `AgentChatRepository.loadInitial()` returns `messages: []` hardcoded and
is not even wired into `ChatProvider`. So after a page refresh the UI state
starts empty, `messages.length === 0`, and the landing screen renders as if the
conversation never happened.

## Goal

On refresh:

1. The thread persists — the agent's history is fetched back into UI state.
2. The landing UI (`LandingHero` + `MeshBackground`) still shows. The user does
   not jump straight into the old conversation.
3. On the first message sent in the session, the landing fades out and the
   conversation appears with the restored history already loaded — no empty
   flash.

Restored messages keep **full fidelity**: rich attachments (transaction lists,
budget cards, option pills) are reconstructed, not just plain text.

Starting a fresh thread (discarding the old one) is out of scope for this
iteration.

## Approach

Fetch history through a server-side API route (chosen over calling
`MastraClient` from the browser, which would leak `MASTRA_BASE_URL`, and over
mirroring messages into `localStorage`, which duplicates the source of truth and
can desync from agent memory). The agent's libsql memory stays the single source
of truth; the UI re-derives its rich messages from it.

## Components

### 1. Shared tool-result → attachment provider

`apps/ui/src/chat/providers/tool-result-attachment.ts` (new).

`mastra-stream-mapper.ts` already owns `toAttachment(toolName, result)` plus its
helpers (`asDisplayAttachment`, `ATTACHMENT_KINDS`, `rec`, `str`). Extract that
mapping into this provider so both the live stream mapper and the new history
mapper consume one definition of tool→attachment. `mastra-stream-mapper.ts`
imports `toAttachment` from here instead of defining it.

### 2. History message mapper

`apps/ui/src/chat/providers/history-message-mapper.ts` (new).

Input: the persisted messages returned by `listMessages()` (`MastraDBMessage[]`).
Output: `Message[]` in the UI domain shape.

For each persisted message:

- **User messages** → `UserMessage` (`id`, `text`, `sentAt` from `createdAt`).
- **Assistant messages** → `GastiMessage`. Walk the message `parts`:
  - text parts → concatenated into `text`.
  - `tool-invocation` parts → a `ToolCall` (`id`, `name`, `inputs` from `args`),
    and if the part carries a result, run it through the shared
    `toAttachment(toolName, result)` to rebuild the attachment.
- Any reconstructed `optionPills` attachment is marked `resolved: true` — restored
  pills are history, not live actions.

The exact shape of `MastraDBMessage` parts (text vs `tool-invocation`, where the
result lives) must be confirmed against the actual stored data during planning,
since the schema is not guessed from docs.

### 3. `GET /api/chat` route

`apps/ui/app/api/chat/route.ts` — add a `GET` handler alongside the existing
`POST`.

- Reads `threadId` and `resourceId` from query params.
- `new MastraClient({ baseUrl: MASTRA_BASE_URL }).getMemoryThread({ threadId, agentId: 'gasti' }).listMessages()`.
- Passes the result through `history-message-mapper`.
- Returns `{ messages: Message[] }` as JSON.
- On any failure or non-existent thread → `{ messages: [] }` (never throws to the
  client).

### 4. `AgentChatRepository.loadInitial()`

`apps/ui/src/chat/repositories/agent-chat-repository.ts`.

Replace the hardcoded `messages: []` with a `fetch('/api/chat?threadId=…&resourceId=…')`
using `getThreadId()` / `RESOURCE_ID`. Returns the `Conversation` with the
restored messages. On fetch failure, returns an empty conversation (graceful
degradation — the user just sees the landing as today).

### 5. Reducer & state — separate "view" from message count

`apps/ui/src/chat/infrastructure/chat-reducer.ts`.

Today `ChatScreen` derives `isEmpty = messages.length === 0` to pick landing vs
conversation. That breaks once `messages` is populated on mount. Add:

- `view: 'landing' | 'conversation'` to `ChatState`, initial value `'landing'`.
- Action `HYDRATE_HISTORY` — replaces `messages` with the restored array, leaves
  `view` untouched.
- Action `ENTER_CONVERSATION` — sets `view: 'conversation'`. Idempotent.

### 6. `ChatProvider` wiring

`apps/ui/src/chat/infrastructure/chat-context.tsx`.

- Wire the existing `makeLoadInitialConversation` use-case (currently defined but
  unused).
- On mount, a `useEffect` calls it once and dispatches `HYDRATE_HISTORY` with the
  restored messages. Track completion in a ref/promise.
- `sendMessage` and `pickOption` dispatch `ENTER_CONVERSATION` before their first
  turn. They `await` the initial-load promise first, so a message sent before
  history finishes loading is appended *after* the restored history, not before.

### 7. `ChatScreen` — view-driven rendering and fade

`apps/ui/src/chat/components/chat-screen.tsx`.

- Replace `isEmpty` with `view === 'landing'`.
- Landing → conversation transition: `LandingHero` + `MeshBackground` fade out
  over `--dur-slow` (480ms) with `--ease-out`; `ConversationThread` renders with
  the restored messages already present, so it appears fully loaded. Individual
  messages keep their existing entrance animation (320ms `--ease-spring`, per
  `DESIGN.md`). No empty-state flash.

## Data flow

```
mount
  └─ ChatProvider useEffect
       └─ loadInitialConversation()
            └─ AgentChatRepository.loadInitial()
                 └─ GET /api/chat?threadId&resourceId
                      └─ MastraClient.getMemoryThread().listMessages()
                           └─ history-message-mapper → Message[]
       └─ dispatch HYDRATE_HISTORY   (messages filled, view stays 'landing')

first sendMessage / pickOption
  └─ await initial-load promise
  └─ dispatch ENTER_CONVERSATION    (view → 'conversation', landing fades out)
  └─ normal streaming turn
```

## Error handling

- `GET /api/chat` never throws to the client; failures yield `{ messages: [] }`.
- `loadInitial()` fetch failure → empty conversation; the user sees the landing,
  exactly as today. No error UI for a missing/empty thread.
- A send before history finishes loading is serialized via the awaited load
  promise — no ordering bug.

## Testing

`apps/ui` has no test harness today; this iteration ships no UI tests. Manual
verification:

1. Send a few messages including one that produces a transaction list and one
   that produces option pills. Refresh.
2. Confirm the landing screen shows after refresh (not the conversation).
3. Send a message. Confirm the landing fades out and the conversation shows the
   full restored history — transaction list and budget cards intact, old pills
   present but not clickable — followed by the new exchange.
4. Refresh with no prior thread → landing shows; first send → clean conversation
   with just the new exchange.

## Out of scope

- A "new conversation" / reset-thread action.
- Persisting or paginating very long threads (`listMessages()` default page is
  used; pagination can come later if threads grow large).
- UI test harness.
