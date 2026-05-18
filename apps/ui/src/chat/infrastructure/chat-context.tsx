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
