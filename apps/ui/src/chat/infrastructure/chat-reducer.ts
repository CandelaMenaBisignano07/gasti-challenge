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
