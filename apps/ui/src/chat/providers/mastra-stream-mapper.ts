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
