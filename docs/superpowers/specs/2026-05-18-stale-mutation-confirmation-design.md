# Stale mutation confirmation on session resume

**Date:** 2026-05-18
**Status:** Approved — planned (`docs/superpowers/plans/2026-05-18-stale-mutation-confirmation.md`)

## Problem

A pending transaction-mutation confirmation leaks across a page load.

The mutation flow is two-step: `proposeTransactionMutation` (read-only) identifies
the target and the UI renders `optionPills` ("Sí, borralo" / "Cancelar"); the agent
then confirms or drops it based on the user's *next* message. The whole flow is
prompt-level — `agent-chat-repository.ts` is explicit: *"The agent has no concept
of pills — confirming a mutation is just the user's next text turn."* Tapping a
pill just sends plain text. All confirm / cancel / expire logic lives in
`instructions.ts`, the `MUTATIONS` block.

When the user leaves mid-confirmation and comes back:

- The UI side is already correct — `history-message-mapper.ts:80-82` marks
  restored pills `resolved: true`, so the buttons are dead after a reload.
- The **agent** side is not. The agent re-derives the pending proposal from
  `lastMessages` and evaluates whatever the user types next against it. So a
  returning "holi" gets read as a non-confirmation of a delete the user has
  mentally moved on from.

Two concrete bugs result:

1. **`instructions.ts:73`** licenses an announcement — *"you may briefly note it
   was not carried out"* — producing *"Eliminación de la transacción de Rappi no
   realizada"* in response to a plain greeting. The agent narrates a non-event.
2. The UI says the proposal is no longer confirmable (dead pills) while the agent
   still treats it as live. A post-reload affirmative ("sí", "dale") would still
   reach `deleteTransaction`, because `instructions.ts:70` accepts clear
   affirmative text as confirmation and the agent has no signal that a page load
   happened in between.

`instructions.ts:71-72` already expire a proposal after the single turn that
follows it, so a non-affirmative reply does not delete — that part works. The gap
is the *announcement* (bug 1) and the *post-reload affirmative* (bug 2).

## Goal

1. After a page load, any mutation proposal from before the load is void — the
   agent neither acts on it nor mentions it. A post-reload "sí" resurrects
   nothing; the agent says there is nothing pending.
2. A non-answer to a live confirmation drops the proposal **silently** — no
   "no realizada" narration. The drop is acknowledged only when the user's new
   message actually refers to that transaction.
3. Within a live session, nothing changes. A still-live pill clicked however
   late still confirms — same session, deliberate click on a labelled button.

## Out of scope

- A time/idle expiry for *live* proposals (an open tab, no reload, user returns
  hours later, clicks the still-live "Sí, borralo"). Decided against: a clicked
  confirm button is an intentional act; the dangerous path was always free text,
  which Goal 2 covers. No gap timer.
- ChatGPT-style multi-thread "conversations". Gasti stays one permanent thread
  per the WhatsApp model (`PRODUCT.md` — single user, single thread).

## Approach

Two independent fixes, neither touching the thread.

**A — mount-scoped resume marker.** Detection of a resumed session is **page
mount**, not a gap/idle timer. Rationale: the UI *already* retires the pills on
restore, so the product has already made a page load the boundary at which a
mutation stops being confirmable. The agent simply has to match that boundary.
The first message sent after a `ChatProvider` mount carries a boolean
`sessionResumed`; when true, the prompt voids any earlier proposal.

**B — `instructions.ts:73` rewrite.** A lapsed proposal drops silently. This is
independent of A and also fixes the same-session case (user replies to a live
confirmation with something unrelated).

### Marker rail

The marker is client-derived, so it travels to the server over the wire. The
chosen rail is a **request header read by the existing server middleware** — the
documented Mastra pattern (`docs/server/request-context.md`, "Setting values
based on request headers"):

- `POST /api/chat` constructs its per-request `MastraClient` with an
  `x-session-resumed` header.
- The middleware in `mastra/index.ts` — which already sets `today` / `userId` /
  `categories` — reads the header and adds `requestContext.set('sessionResumed', …)`.
- The agent's `requestContextSchema` gains the field so it is validated.

(`@mastra/client-js` also exposes a `requestContext` option on `agent.stream`.
The header path is preferred: it is fully deterministic and avoids any ambiguity
about how a client-supplied `requestContext` merges with middleware-set values.)

This builds on `2026-05-18-thread-persistence-restore-design.md` (the mount
restore, `HYDRATE_HISTORY`, the `historyLoaded` ref). That work is assumed in
place.

## Components

### 1. First-send-after-mount detection

`apps/ui/src/chat/infrastructure/chat-context.tsx`.

- A `useRef(true)` `isFirstSend`. `sendMessage` reads it for the marker, then
  sets it `false`. Refs reset only on remount — which is exactly a page load.
- A ref capturing whether the mount restored a non-empty history (set when
  `HYDRATE_HISTORY` is dispatched). `sessionResumed = isFirstSend.current &&
  hadRestoredHistory.current` — "resumed" should mean there was something to
  resume. A brand-new user's first-ever message sends `false`.
- `pickOption` does **not** carry the marker. A pill that exists at mount is a
  restored pill, already `resolved: true` and unclickable; the first action of a
  resumed session can never be a live pill click.

### 2. Marker through the send path

`apps/ui/src/chat/use-cases/send-user-message.ts`,
`apps/ui/src/chat/domain/chat-repository.ts`,
`apps/ui/src/chat/repositories/agent-chat-repository.ts`.

The `sendUserMessage` use-case input and the `reply` repository contract gain an
optional `sessionResumed: boolean`; `AgentChatRepository` forwards it into the
`POST /api/chat` body. `confirmOption` passes `false`.

### 3. `POST /api/chat` — forward the marker as a header

`apps/ui/app/api/chat/route.ts`.

- `ChatRequest` gains `sessionResumed?: boolean`.
- The per-request `MastraClient` is constructed with
  `headers: { 'x-session-resumed': String(sessionResumed ?? false) }`.

### 4. Agent — receive and validate the marker

`apps/ai/src/agent/gasti-agent.ts`, `apps/ai/src/mastra/index.ts`.

- `requestContextSchema` gains `sessionResumed: z.boolean().optional()`.
- The existing server middleware reads the `x-session-resumed` header and sets
  `requestContext.set('sessionResumed', header === 'true')`.

### 5. `buildInstructions` — conditional resume clause

`apps/ai/src/agent/instructions.ts`.

Read `requestContext.get('sessionResumed')`. When true, append a clause to the
`MUTATIONS` section:

> The user has just reopened the chat. Any transaction delete or edit proposal
> earlier in this conversation is void — do not act on it and do not mention it,
> even if this message looks like a confirmation. Treat this message as a fresh
> start.

This overrides `instructions.ts:72`'s "valid for the single turn that
immediately follows" for the reload case: from the agent's history-reading view
the resumed message *is* that following turn, so without the clause a post-reload
"sí" would confirm.

### 6. Rewrite `instructions.ts:73`

Current text licenses narration of a dropped proposal. Replace so that:

- A lapsed proposal is dropped **silently** — the agent answers the new message
  with no mention of the abandoned mutation.
- The drop is acknowledged *only* when the user's new message actually refers to
  that transaction (e.g. asks about it again).

Independent of the marker; also fixes the in-session case (live confirmation +
unrelated reply).

## Data flow

```
mount
  └─ ChatProvider: isFirstSend = true; hadRestoredHistory set by HYDRATE_HISTORY

first sendMessage after mount
  └─ sessionResumed = isFirstSend && hadRestoredHistory   (then isFirstSend = false)
       └─ sendUserMessage use-case  ─ sessionResumed
            └─ AgentChatRepository  ─ POST /api/chat { …, sessionResumed }
                 └─ route.ts  ─ MastraClient header x-session-resumed
                      └─ mastra/index.ts middleware ─ requestContext.set('sessionResumed', …)
                           └─ requestContextSchema validates
                                └─ buildInstructions: appends resume clause when true
                                     └─ agent voids any pre-reload proposal

subsequent sends in the session
  └─ sessionResumed = false  → normal MUTATIONS behaviour
```

## Error handling

- `x-session-resumed` header absent → middleware sets `sessionResumed` to
  `false`; mutation handling is unchanged (the existing one-turn expiry at
  `instructions.ts:72` still applies).
- Nothing throws. The marker is advisory; a missing marker degrades to today's
  behaviour, not an error.

## Testing

`apps/ui` has no test harness and the agent itself is not unit-tested
(`PRODUCT.md` — LLM output is non-deterministic). `buildInstructions` is a pure
function, so it gets a `bun:test` unit test: the resume clause is present when
`sessionResumed` is `true`, absent when `false` / unset, and the silent-drop
wording is present.

Manual verification:

1. Ask Gasti to delete a transaction; it proposes and shows the pills. Reload the
   page before answering.
2. Send "holi". Confirm Gasti greets normally — no "no realizada", no mention of
   the deletion.
3. Repeat, but after reload send "sí". Confirm nothing is deleted and Gasti says
   there is nothing pending.
4. In a single session (no reload): propose a delete, then reply with an
   unrelated question. Confirm Gasti answers the question, does not delete, and
   does not narrate the dropped proposal.
5. In a single session: propose a delete, wait, then click the still-live
   "Sí, borralo". Confirm it still deletes.
