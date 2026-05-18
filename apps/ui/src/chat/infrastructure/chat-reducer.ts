import type { GastiMessage, Message, MessageAttachment, ToolCall, UserMessage } from '@/chat/domain/message';

export type ChatStatus = 'idle' | 'thinking';

export type ChatState = {
  messages: Message[];
  status: ChatStatus;
};

export const initialChatState: ChatState = {
  messages: [],
  status: 'idle',
};

export type ChatAction =
  | { type: 'APPEND_USER'; message: UserMessage }
  | { type: 'SET_THINKING' }
  | { type: 'ADD_TOOL_CALL_TO_PENDING'; call: ToolCall }
  | { type: 'APPEND_GASTI'; message: GastiMessage }
  | { type: 'RESOLVE_LAST_OPTIONS' }
  | { type: 'RESET' };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'APPEND_USER':
      return { ...state, messages: [...state.messages, action.message] };

    case 'SET_THINKING':
      return { ...state, status: 'thinking' };

    case 'ADD_TOOL_CALL_TO_PENDING': {
      // Reserved for streaming; for v1 we just keep the call to attach on APPEND_GASTI.
      // No state mutation needed — the mock attaches tool calls directly to the final message.
      return state;
    }

    case 'APPEND_GASTI':
      return { messages: [...state.messages, action.message], status: 'idle' };

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
