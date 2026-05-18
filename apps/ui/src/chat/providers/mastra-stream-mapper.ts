import type { ReplyEvent } from '@/chat/domain/chat-repository';
import type { GastiMessage, MessageAttachment, ToolCall } from '@/chat/domain/message';
import type { Transaction } from '@/transactions/domain/transaction';
import type { BudgetProgress } from '@/budgets/domain/budget-progress';

/**
 * A Mastra stream chunk: `{ type, payload }`. `payload` is `unknown` so that
 * `@mastra/client-js`'s concretely-typed `ChunkType` union is assignable here
 * (its typed payloads have no string index signature). The mapper narrows
 * `payload` per chunk via the `rec()` helper.
 */
export type MastraChunk = { type: string; payload?: unknown };

type ChunkPayload = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const rec = (v: unknown): Record<string, unknown> =>
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
 * Maps a tool's `tool-result` output to a UI attachment. Mastra streams the raw
 * tool output (not the agent's `transform.display` payload), so the three
 * display transforms from `apps/ai` are mirrored here, keyed by tool name. A
 * gateway error envelope (`{ error: true }`) yields no attachment.
 */
function toAttachment(toolName: string, result: unknown): MessageAttachment | null {
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
