'use client';

import { useEffect, useState } from 'react';
import { Composer } from '@/chat/components/composer';
import { ConversationThread } from '@/chat/components/conversation-thread';
import { Header } from '@/chat/components/header';
import { LandingHero } from '@/chat/components/landing-hero';
import { MeshBackground } from '@/shared/mesh/mesh-background';
import { useChat } from '@/chat/infrastructure/use-chat';
import { useProactive } from '@/proactive/infrastructure/use-proactive';
import type { BackfillRunSummary } from '@/mp/domain/mp-connection';

type ChatScreenProps = {
  backfillSummary?: BackfillRunSummary | null;
  onDismissBackfill?: () => void;
};

export function ChatScreen({ backfillSummary = null, onDismissBackfill }: ChatScreenProps = {}) {
  const { messages, status, streamingMessage, view, sendMessage, reset } = useChat();
  const { prompts } = useProactive();
  // A pending backfill summary or a live proactive prompt both act like
  // in-progress conversations: they force the chat surface so the card
  // surfaces in real time, instead of being hidden behind the landing hero.
  const isLanding =
    view === 'landing' && backfillSummary === null && prompts.length === 0;
  const composerState = status === 'thinking' ? 'thinking' : 'idle';
  const threadMessages = streamingMessage ? [...messages, streamingMessage] : messages;

  // Keep the landing hero mounted for one fade-out cycle after entering the
  // conversation, so it dissolves (480ms) instead of cutting out abruptly.
  const [landingMounted, setLandingMounted] = useState(true);
  useEffect(() => {
    if (isLanding) {
      setLandingMounted(true);
      return;
    }
    // 480ms must stay in sync with the `duration-slow` class below (--dur-slow).
    const timer = setTimeout(() => setLandingMounted(false), 480);
    return () => clearTimeout(timer);
  }, [isLanding]);

  return (
    <>
      <MeshBackground visible={isLanding} />
      <div className="relative flex min-h-screen flex-col">
        <Header variant={isLanding ? 'frosted' : 'solid'} onTitleClick={reset} />

        <main className="relative flex-1 mx-auto w-full max-w-[720px] px-s4 sm:px-s6 lg:px-s7 pb-[100px]">
          {!isLanding && (
            <ConversationThread
              messages={threadMessages}
              pending={status === 'thinking' && streamingMessage === null}
              backfillSummary={backfillSummary}
              onDismissBackfill={onDismissBackfill}
            />
          )}
          {landingMounted && (
            <div
              className={[
                'transition-opacity duration-slow ease-out',
                isLanding
                  ? 'opacity-100'
                  : 'pointer-events-none absolute inset-0 opacity-0',
              ].join(' ')}
            >
              <LandingHero />
            </div>
          )}
        </main>

        <div
          className={[
            'pointer-events-none fixed inset-x-0 bottom-0 z-10 pt-s8',
            isLanding ? '' : 'bg-gradient-to-t from-surface-1 via-surface-1 to-transparent',
          ]
            .filter(Boolean)
            .join(' ')}
        >
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
