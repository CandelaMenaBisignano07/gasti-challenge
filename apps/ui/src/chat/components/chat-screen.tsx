'use client';

import { Composer } from '@/chat/components/composer';
import { ConversationThread } from '@/chat/components/conversation-thread';
import { Header } from '@/chat/components/header';
import { LandingHero } from '@/chat/components/landing-hero';
import { MeshBackground } from '@/shared/mesh/mesh-background';
import { useChat } from '@/chat/infrastructure/use-chat';

export function ChatScreen() {
  const { messages, status, sendMessage } = useChat();
  const isEmpty = messages.length === 0;
  const composerState = status === 'thinking' ? 'thinking' : 'idle';

  return (
    <>
      <MeshBackground visible={isEmpty} />
      <div className="relative flex min-h-screen flex-col">
        <Header variant={isEmpty ? 'frosted' : 'solid'} />

        <main className="flex-1 mx-auto w-full max-w-[720px] px-s4 sm:px-s6 lg:px-s7 pb-[140px]">
          {isEmpty ? (
            <LandingHero />
          ) : (
            <ConversationThread messages={messages} pending={status === 'thinking'} />
          )}
        </main>

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10">
          <div className="mx-auto w-full max-w-[720px] px-s4 sm:px-s6 lg:px-s7 pb-s5">
            <div className="pointer-events-auto">
              <Composer
                onSubmit={(text) => void sendMessage(text)}
                state={composerState}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
