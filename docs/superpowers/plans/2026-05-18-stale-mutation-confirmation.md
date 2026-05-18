# Stale Mutation Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A transaction-mutation confirmation left pending before a page reload no longer leaks into the next session — the agent voids it instead of misreading the next message.

**Architecture:** The first message sent after a `ChatProvider` mount that restored prior history carries a boolean `sessionResumed`. It travels UI → `POST /api/chat` body → an `x-session-resumed` request header → the existing Mastra server middleware → `requestContext` → `buildInstructions`, which appends a clause voiding any earlier proposal. Independently, the `MUTATIONS` prompt block is reworded so a lapsed proposal is dropped silently. Detection is page mount, not a time-gap timer.

**Tech Stack:** Next.js 15 App Router (`apps/ui`), Mastra `@mastra/core` agent + `@mastra/client-js` (`apps/ai`), Zod, Bun, `bun:test`.

**Rail note (deviation from design doc):** The design doc proposed passing `requestContext` directly to `agent.stream`. During planning we chose the header + existing-middleware variant instead: it is the exact documented Mastra pattern (`docs/server/request-context.md`, "Setting values based on request headers"), is fully deterministic, and avoids any ambiguity about how a client-supplied `requestContext` merges with middleware-set values. The design doc explicitly flagged this for sanity-check at planning time. Observable behavior is identical.

**Testing approach:** Task 1 is TDD'd against `buildInstructions` — a pure function. Tasks 2–5 are wiring across `apps/ai` and `apps/ui`, which have no unit-test harness for this surface (`PRODUCT.md`: the agent and UI are not unit-tested; precedent: `2026-05-18-thread-persistence-restore-design.md`). They are verified by TypeScript compilation and the manual verification in Task 6.

---

### Task 1: Agent prompt — session-resume clause + silent mutation drop

**Files:**
- Modify: `apps/ai/tsconfig.json`
- Create: `apps/ai/src/agent/instructions.test.ts`
- Modify: `apps/ai/src/agent/instructions.ts`

- [ ] **Step 1: Exclude test files from the `apps/ai` typecheck**

`apps/ai/tsconfig.json` currently compiles `src/**/*` with no test exclusion; `apps/api` already excludes test files. Mirror that so `bun:test` files do not break `tsc`.

In `apps/ai/tsconfig.json`, change the `exclude` array:

```json
  "exclude": ["node_modules", "dist", ".mastra", "src/**/*.test.ts"]
```

- [ ] **Step 2: Write the failing test**

Create `apps/ai/src/agent/instructions.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run from `apps/ai`: `bun test src/agent/instructions.test.ts`
Expected: FAIL — "includes the session-resume clause" and "drop a lapsed mutation silently" fail (the strings do not exist yet). "omits the resume clause" passes already.

- [ ] **Step 4: Add the `sessionResumed` read and resume clause**

In `apps/ai/src/agent/instructions.ts`, find:

```typescript
  const categoryList = categories.join(', ');
```

Replace with:

```typescript
  const categoryList = categories.join(', ');
  const sessionResumed = requestContext.get('sessionResumed') === true;
  const resumeClause = sessionResumed
    ? `\n- The user has just reopened the chat. Any transaction delete or edit proposal earlier in this conversation is void — do not act on it and do not mention it, even if this message looks like a confirmation. Treat this message as a fresh start.`
    : '';
```

- [ ] **Step 5: Interpolate the resume clause into the MUTATIONS block**

In `apps/ai/src/agent/instructions.ts`, find:

```
- A confirmation ("sí, borralo") with no mutation proposed in the immediately previous turn refers to nothing — say there is nothing pending and ask what they want to do.
- Never delete in bulk. "Borrá todo" / "borrá todas mis transacciones" → do not do it; ask which specific transaction they mean.
```

Replace with:

```
- A confirmation ("sí, borralo") with no mutation proposed in the immediately previous turn refers to nothing — say there is nothing pending and ask what they want to do.${resumeClause}
- Never delete in bulk. "Borrá todo" / "borrá todas mis transacciones" → do not do it; ask which specific transaction they mean.
```

- [ ] **Step 6: Reword the lapsed-mutation rule (silent drop)**

In `apps/ai/src/agent/instructions.ts`, find:

```
- If you drop a pending mutation because the user moved on, you may briefly note it was not carried out, then address what they actually asked.
```

Replace with:

```
- When you drop a pending mutation because the user moved on, drop it silently — answer the user's new message and do not mention the abandoned mutation, unless that new message itself refers to the transaction, in which case you may briefly note it was not carried out.
```

- [ ] **Step 7: Run the test to verify it passes**

Run from `apps/ai`: `bun test src/agent/instructions.test.ts`
Expected: PASS — 3 tests, 0 failures.

- [ ] **Step 8: Commit**

```bash
git add apps/ai/tsconfig.json apps/ai/src/agent/instructions.test.ts apps/ai/src/agent/instructions.ts
git commit -m "feat: add session-resume handling to agent instructions"
```

---

### Task 2: Agent wiring — receive `sessionResumed` via middleware

**Files:**
- Modify: `apps/ai/src/agent/gasti-agent.ts:18-22`
- Modify: `apps/ai/src/mastra/index.ts:43-46`

- [ ] **Step 1: Add `sessionResumed` to the agent's request-context schema**

In `apps/ai/src/agent/gasti-agent.ts`, find:

```typescript
    requestContextSchema: z.object({
      today: z.string(),
      userId: z.string(),
      categories: z.array(z.string()),
    }),
```

Replace with:

```typescript
    requestContextSchema: z.object({
      today: z.string(),
      userId: z.string(),
      categories: z.array(z.string()),
      sessionResumed: z.boolean().optional(),
    }),
```

- [ ] **Step 2: Populate `sessionResumed` from the request header in middleware**

In `apps/ai/src/mastra/index.ts`, find:

```typescript
        const requestContext = context.get('requestContext');
        requestContext.set('today', new Date().toISOString().slice(0, 10));
        requestContext.set('userId', 'default-user');
```

Replace with:

```typescript
        const requestContext = context.get('requestContext');
        requestContext.set('today', new Date().toISOString().slice(0, 10));
        requestContext.set('userId', 'default-user');
        requestContext.set('sessionResumed', context.req.header('x-session-resumed') === 'true');
```

- [ ] **Step 3: Verify it typechecks**

Run from `apps/ai`: `bunx tsc -p tsconfig.json`
Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add apps/ai/src/agent/gasti-agent.ts apps/ai/src/mastra/index.ts
git commit -m "feat: pass sessionResumed to the agent via request context"
```

---

### Task 3: API route — forward `sessionResumed` as a header

**Files:**
- Modify: `apps/ui/app/api/chat/route.ts:10` (type), `:25` (destructure), `:34` (client)

- [ ] **Step 1: Add `sessionResumed` to the request type**

In `apps/ui/app/api/chat/route.ts`, find:

```typescript
type ChatRequest = { text: string; threadId: string; resourceId: string };
```

Replace with:

```typescript
type ChatRequest = { text: string; threadId: string; resourceId: string; sessionResumed?: boolean };
```

- [ ] **Step 2: Destructure `sessionResumed` from the request body**

In `apps/ui/app/api/chat/route.ts`, find:

```typescript
  const { text, threadId, resourceId } = (await req.json()) as ChatRequest;
```

Replace with:

```typescript
  const { text, threadId, resourceId, sessionResumed } = (await req.json()) as ChatRequest;
```

- [ ] **Step 3: Send the `x-session-resumed` header on the agent call**

In `apps/ui/app/api/chat/route.ts`, find (inside the `POST` handler's `start`):

```typescript
        const client = new MastraClient({ baseUrl: MASTRA_BASE_URL });
        const agent = client.getAgent('gasti');
```

Replace with:

```typescript
        const client = new MastraClient({
          baseUrl: MASTRA_BASE_URL,
          headers: { 'x-session-resumed': String(sessionResumed ?? false) },
        });
        const agent = client.getAgent('gasti');
```

(Leave the `GET` handler's `MastraClient` untouched — history restore does not need the marker.)

- [ ] **Step 4: Verify it typechecks**

Run from `apps/ui`: `bunx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/app/api/chat/route.ts
git commit -m "feat: forward sessionResumed header from the chat API route"
```

---

### Task 4: UI send path — thread `sessionResumed` through repository & use-case

**Files:**
- Modify: `apps/ui/src/chat/domain/chat-repository.ts:12`
- Modify: `apps/ui/src/chat/repositories/agent-chat-repository.ts:56-64`, `:70`
- Modify: `apps/ui/src/chat/use-cases/send-user-message.ts:15`, `:27`

- [ ] **Step 1: Add `sessionResumed` to the `reply` contract**

In `apps/ui/src/chat/domain/chat-repository.ts`, find:

```typescript
  reply(input: { text: string; history: Message[] }): AsyncIterable<ReplyEvent>;
```

Replace with:

```typescript
  reply(input: { text: string; history: Message[]; sessionResumed?: boolean }): AsyncIterable<ReplyEvent>;
```

- [ ] **Step 2: Thread `sessionResumed` through `AgentChatRepository`**

In `apps/ui/src/chat/repositories/agent-chat-repository.ts`, find:

```typescript
  reply(input: { text: string; history: Message[] }): AsyncIterable<ReplyEvent> {
    return this.#stream(input.text);
  }

  confirmOption(input: { optionId: string; history: Message[] }): AsyncIterable<ReplyEvent> {
    return this.#stream(resolveOptionLabel(input.optionId, input.history));
  }

  async *#stream(text: string): AsyncIterable<ReplyEvent> {
```

Replace with:

```typescript
  reply(input: { text: string; history: Message[]; sessionResumed?: boolean }): AsyncIterable<ReplyEvent> {
    return this.#stream(input.text, input.sessionResumed ?? false);
  }

  confirmOption(input: { optionId: string; history: Message[] }): AsyncIterable<ReplyEvent> {
    return this.#stream(resolveOptionLabel(input.optionId, input.history), false);
  }

  async *#stream(text: string, sessionResumed: boolean): AsyncIterable<ReplyEvent> {
```

- [ ] **Step 3: Include `sessionResumed` in the POST body**

In `apps/ui/src/chat/repositories/agent-chat-repository.ts`, find:

```typescript
        body: JSON.stringify({ text, threadId: getThreadId(), resourceId: RESOURCE_ID }),
```

Replace with:

```typescript
        body: JSON.stringify({ text, threadId: getThreadId(), resourceId: RESOURCE_ID, sessionResumed }),
```

- [ ] **Step 4: Accept and forward `sessionResumed` in the `sendUserMessage` use-case**

In `apps/ui/src/chat/use-cases/send-user-message.ts`, find:

```typescript
  return async function* sendUserMessage(req: { text: string; history: Message[] }): AsyncIterable<DispatchedEvent> {
```

Replace with:

```typescript
  return async function* sendUserMessage(req: { text: string; history: Message[]; sessionResumed?: boolean }): AsyncIterable<DispatchedEvent> {
```

Then find:

```typescript
    for await (const ev of repo.reply({ text: trimmed, history: [...req.history, userMessage] })) {
```

Replace with:

```typescript
    for await (const ev of repo.reply({ text: trimmed, history: [...req.history, userMessage], sessionResumed: req.sessionResumed })) {
```

- [ ] **Step 5: Verify it typechecks**

Run from `apps/ui`: `bunx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/chat/domain/chat-repository.ts apps/ui/src/chat/repositories/agent-chat-repository.ts apps/ui/src/chat/use-cases/send-user-message.ts
git commit -m "feat: thread sessionResumed through the chat send path"
```

---

### Task 5: UI — flag the first send after a page reload

**Files:**
- Modify: `apps/ui/src/chat/infrastructure/chat-context.tsx:28` (refs), `:29-35` (mount effect), `:37-43` (sendMessage)

- [ ] **Step 1: Add the tracking refs**

In `apps/ui/src/chat/infrastructure/chat-context.tsx`, find:

```typescript
  const historyLoaded = useRef<Promise<void> | undefined>(undefined);
```

Replace with:

```typescript
  const historyLoaded = useRef<Promise<void> | undefined>(undefined);
  // Marks the first message of a freshly loaded page that restored prior history,
  // so the agent can void a mutation confirmation left pending before the reload.
  const isFirstSend = useRef(true);
  const hadRestoredHistory = useRef(false);
```

- [ ] **Step 2: Record whether the mount restored any history**

In `apps/ui/src/chat/infrastructure/chat-context.tsx`, find:

```typescript
    historyLoaded.current = loadInitialConversation()
      .then((conv) => {
        dispatch({ type: 'HYDRATE_HISTORY', messages: conv.messages });
      })
      .catch(() => {});
```

Replace with:

```typescript
    historyLoaded.current = loadInitialConversation()
      .then((conv) => {
        hadRestoredHistory.current = conv.messages.length > 0;
        dispatch({ type: 'HYDRATE_HISTORY', messages: conv.messages });
      })
      .catch(() => {});
```

- [ ] **Step 3: Compute `sessionResumed` and pass it on the first send**

In `apps/ui/src/chat/infrastructure/chat-context.tsx`, find:

```typescript
      await historyLoaded.current;
      dispatch({ type: 'ENTER_CONVERSATION' });
      // Typing a new message instead of picking a pill retires any open pills.
      dispatch({ type: 'RESOLVE_LAST_OPTIONS' });
      for await (const ev of sendUserMessage({ text, history: state.messages })) {
```

Replace with:

```typescript
      await historyLoaded.current;
      // First send after a page load that restored history: tell the agent any
      // confirmation pending before the reload is void.
      const sessionResumed = isFirstSend.current && hadRestoredHistory.current;
      isFirstSend.current = false;
      dispatch({ type: 'ENTER_CONVERSATION' });
      // Typing a new message instead of picking a pill retires any open pills.
      dispatch({ type: 'RESOLVE_LAST_OPTIONS' });
      for await (const ev of sendUserMessage({ text, history: state.messages, sessionResumed })) {
```

- [ ] **Step 4: Verify it typechecks**

Run from `apps/ui`: `bunx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/chat/infrastructure/chat-context.tsx
git commit -m "feat: flag the first send after a page reload as session-resumed"
```

---

### Task 6: Manual verification

**Files:** none — runtime verification.

- [ ] **Step 1: Start the stack**

Run from the repo root: `bun dev`
Confirm `apps/ai` (Mastra), `apps/api`, and `apps/ui` are all up. Ensure `MASTRA_BASE_URL` (read by `apps/ui/app/api/chat/route.ts`, default `http://localhost:4112`) points at the running Mastra port. Open `http://localhost:3000`.

- [ ] **Step 2: Smoke test — chat still works**

Send a normal question (e.g. "¿cuánto gasté en comida este mes?"). Confirm Gasti answers — this proves the `requestContextSchema` change and middleware did not break the agent.

- [ ] **Step 3: Reload mid-confirmation, then greet**

Ask Gasti to delete a transaction; wait for the proposal and the "Sí, borralo" / "Cancelar" pills. **Reload the page.** Send "holi".
Expected: Gasti greets normally. No "Eliminación … no realizada", no mention of the deletion.

- [ ] **Step 4: Reload mid-confirmation, then affirm**

Repeat Step 3, but after reloading send "sí".
Expected: nothing is deleted; Gasti says there is nothing pending.

- [ ] **Step 5: Same-session non-answer drops silently**

In one session (no reload): ask Gasti to delete a transaction, then — instead of answering — ask an unrelated question (e.g. "¿cuánto gasté en transporte?").
Expected: Gasti answers the transporte question, does not delete, and does not narrate the dropped proposal.

- [ ] **Step 6: Same-session live pill still confirms**

In one session (no reload): ask Gasti to delete a transaction, wait a moment, then click "Sí, borralo".
Expected: the transaction is deleted.

- [ ] **Step 7: Confirm the test baseline still passes**

Run from `apps/api`: `bun test`
Expected: 66 tests pass, 0 failures (unchanged — this work does not touch `apps/api`).

---

## Self-Review

**Spec coverage** (against `2026-05-18-stale-mutation-confirmation-design.md`):

- Component 1 (first-send-after-mount detection) → Task 5.
- Component 2 (marker through the send path) → Task 4.
- Component 3 (`POST /api/chat`) → Task 3 (header variant — see Rail note).
- Component 4 (agent request-context schema) → Task 2, Step 1.
- Component 5 (`buildInstructions` resume clause) → Task 1, Steps 4–5; middleware feed → Task 2, Step 2.
- Component 6 (`instructions.ts` line-73 rewrite) → Task 1, Step 6.
- Goal 1 (post-reload proposal void) → Tasks 1–5, verified Steps 6.3–6.4.
- Goal 2 (silent drop of a non-answer) → Task 1, Step 6, verified Step 6.5.
- Goal 3 (live pill still confirms) → unchanged by design, verified Step 6.6.

**Type consistency:** `sessionResumed` is `boolean` end to end — optional (`?:` / `z.boolean().optional()`) at each boundary that may omit it (`chat-repository.ts`, `send-user-message.ts`, `ChatRequest`, schema), resolved to a concrete `boolean` via `?? false` where consumed (`#stream`, route header, `buildInstructions` `=== true`). The header value is the string `'true'`/`'false'`; the middleware converts it back with `=== 'true'`.

**Placeholder scan:** none — every step shows exact code and exact commands.
