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
  content?: { parts?: PersistedPart[]; content?: string } | string | null;
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

/** The v2 plain-text fallback: a bare string content, or its `content` field. */
function plainText(content: PersistedMessage['content']): string {
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object' && typeof content.content === 'string') {
    return content.content;
  }
  return '';
}

function mapUserMessage(m: PersistedMessage): UserMessage {
  const fromParts = partsOf(m.content)
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('');
  return { id: m.id, role: 'user', text: fromParts || plainText(m.content), sentAt: toIso(m.createdAt) };
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
