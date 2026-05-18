# Gasti — UI ↔ Agent wiring (design)

**Date:** 2026-05-18
**Status:** Approved for planning
**Topic:** Replace the UI's `MockChatRepository` with a real connection to the Mastra Gasti agent.

---

## Goal

The `apps/ui` chat currently runs on `MockChatRepository` — scripted intents, fake
data. This work wires the chat to the real Mastra agent (`apps/ai`) so the UI
talks to Gasti end to end: user message → agent → tools → `apps/api` → streamed
reply with live tool-call traces.

## Decisions

Settled during brainstorming:

1. **Transport — BFF.** The browser calls a same-origin Next.js route handler
   (`apps/ui/app/api/chat/route.ts`); the handler calls the Mastra agent
   server-side. No CORS, the agent URL stays server-side, idiomatic App Router.
2. **Streaming — full, token by token.** The reply streams: `thinking` and
   `toolCall` fire live, and reply text appears progressively via `partial`.
3. **Attachments — synthesized from tool display payloads.** The agent's tools
   already emit UI-attachment-shaped display payloads via Mastra's
   `transform.display.output`. The route handler reads them off the stream and
   attaches them to the final message.
4. **Memory threading — fixed resource + persisted thread.**
   `resourceId = 'default-user'` (matches the agent server middleware);
   `threadId` is generated once with `crypto.randomUUID()` and persisted in
   `localStorage`. A page reload keeps the conversation thread; resource-scoped
   memory accumulates.
5. **Translation layer — route handler is the anti-corruption layer.** The
   handler maps Mastra chunks to the UI's `ReplyEvent` contract and re-emits a
   clean NDJSON stream. The browser depends only on `ReplyEvent`, never on
   Mastra's wire format.
6. **Data shapes — align UI types to the agent.** The UI `Transaction` and
   `BudgetProgress` types are changed to match the agent's output shapes, so the
   attachment payloads slot in without per-field mapping. The `ReplyEvent`
   stream contract is NOT changed — it stays the UI's own boundary.

## Architecture

```
Browser (client)              Next server (apps/ui)               Mastra server (apps/ai :4112)
────────────────              ─────────────────────               ─────────────────────────────
ChatProvider                  app/api/chat/route.ts               /api/agents/gasti/stream
 └ AgentChatRepository ─POST─▶  └ @mastra/client-js       ─stream─▶  gasti agent (tools + memory)
   (reads NDJSON of             └ mastra-stream-mapper
    ReplyEvent)                   (Mastra chunks → ReplyEvent)
                              ◀──── NDJSON of ReplyEvent ◀────────
```

The browser speaks only `ReplyEvent` (the UI domain contract). Mastra's chunk
format is confined to the server.

## Components

### New files

- **`apps/ui/app/api/chat/route.ts`** — POST handler. Body
  `{ text: string; threadId: string; resourceId: string }`. `runtime = 'nodejs'`.
  Calls the agent with `@mastra/client-js`, returns a `ReadableStream` of NDJSON
  `ReplyEvent`s produced by the mapper.
- **`apps/ui/src/chat/providers/mastra-stream-mapper.ts`** — pure, server-side.
  Consumes Mastra stream chunks, accumulates state, yields `ReplyEvent`s.
- **`apps/ui/src/chat/repositories/agent-chat-repository.ts`** — implements
  `ChatRepository`. `reply()` and `confirmOption()` POST to `/api/chat` and parse
  the NDJSON response into `ReplyEvent`s. `loadInitial()` returns an empty
  conversation (v1).
- **`apps/ui/src/chat/infrastructure/chat-session.ts`** — resolves identity:
  `resourceId = 'default-user'` (constant); `threadId` read from
  `localStorage['gasti.thread']`, or a fresh `crypto.randomUUID()` persisted there.

### Modified files

- **`chat/infrastructure/chat-context.tsx`** — swap `new MockChatRepository()`
  for `new AgentChatRepository()`; handle the `partial` event.
- **`chat/infrastructure/chat-reducer.ts`** — add the streaming path (below).
- **`transactions/domain/transaction.ts`**, **`budgets/domain/budget-progress.ts`**
  and the components/providers that consume them (below).

`MockChatRepository` stays — it still implements `ChatRepository` and is kept for
tests and as a fallback.

## The mapper (`mastra-stream-mapper`)

Consumes Mastra chunks, accumulates `text` / `toolCalls` / `attachments`, emits
`ReplyEvent`s:

| Mastra chunk | → `ReplyEvent` |
|---|---|
| stream start | `{ kind: 'thinking' }` (emitted once) |
| `tool-call` | `{ kind: 'toolCall', call: { id: toolCallId, name: toolName, inputs: args } }` |
| `tool-result` | if `payload.result` is a display payload (`transactionList` / `budgetProgress` / `optionPills`), stash it as a pending attachment |
| `text-delta` | `{ kind: 'partial', text: delta }` |
| `finish` | `{ kind: 'final', message: { id, role: 'gasti', text, toolCalls, attachments, sentAt } }` |
| `error` / `tool-error` | `final` message with an honest error text |

**Open implementation detail:** if `tool-result.payload.result` carries the raw
tool output instead of the `transform.display.output` payload, the mapper
mirrors the same transform functions (they are pure — `listTransactions`,
`getBudgetProgress`, `proposeTransactionMutation`). This fallback is planned for.

## Streaming in the reducer

Today `ADD_TOOL_CALL_TO_PENDING` is a no-op stub and there is no in-progress
message. Changes:

- `ChatState` gains `streamingMessage: GastiMessage | null`.
- `SET_THINKING` → `status: 'thinking'`.
- First `partial` → create `streamingMessage` with the text; subsequent
  `partial` → append text.
- `toolCall` → push the `ToolCall` onto `streamingMessage.toolCalls` (consumed
  live by `ToolCallTrace`).
- `final` → move `streamingMessage` (replaced by the final message, with
  attachments) into `messages`; clear `streamingMessage`; `status: 'idle'`.
- `ConversationThread` renders `[...messages, streamingMessage]`.

## Confirm / option-pill flow

The agent has no notion of option pills: its `MUTATIONS` instruction expects a
plain-language confirmation as the user's next turn. So `confirmOption({
optionId, history })` resolves the picked option's `label` from the last
unresolved `optionPills` attachment in `history` and sends that label
(e.g. `"Sí, borralo"`, `"Cancelar"`) as a normal text turn to `/api/chat`.
There is no separate confirm endpoint.

## Data-shape alignment

- **`transactions/domain/transaction.ts`** → match the agent's `transactionSchema`:
  `amount` is positive, `date` is `yyyy-MM-dd`. `TransactionRow` stops passing
  `signed` to `<Num>` (the list shows expenses without a sign).
- **`budgets/domain/budget-progress.ts`** → `{ category, budget, spent,
  remaining, pace: 'under' | 'on' | 'over', projected }`. Update
  `budgets/providers/budget-state.ts` (`projection` → `projected`) and
  `BudgetProgressCard` (drop `periodLabel`; `caption` stays a component prop).
- **`MessageAttachment`** (`chat/domain/message.ts`) — the `kind`s already match;
  unchanged.
- `chat/repositories/mock-data.ts` and `mock-chat-repository.ts` are adjusted to
  keep compiling against the new types.

## Error handling

- Mastra unreachable → the route handler emits a `final` `ReplyEvent` with an
  honest text ("No pude conectarme..."). Never a silent 500.
- Tool errors → the agent already narrates these (its `GROUNDING` instruction
  plus the gateway error envelope). The mapper still handles `error` /
  `tool-error` chunks defensively.
- A broken fetch / stream in the browser → the repository yields a `final`
  error message.

## Testing

`apps/ui` has only a `typecheck` script (no test runner). v1 verification:
`tsc --noEmit` plus manual verification in the running app against the live
agent. The mapper is written as a pure function so a `bun test` unit test can be
added later without restructuring.

## Environment

- `apps/ui/.env`: `MASTRA_BASE_URL=http://localhost:4112` — server-side only, no
  `NEXT_PUBLIC_` prefix. `.env.example` updated.
- New dependency: `@mastra/client-js` in `apps/ui`.

## Out of scope (YAGNI)

- Multi-conversation / thread-list UI.
- `loadInitial()` restoring visible history — the conversation starts empty on
  load; the thread persists only for agent memory continuity.
- Streaming `reasoning` chunks.
- Authentication / multi-user.
