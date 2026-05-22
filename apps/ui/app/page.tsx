'use client';

import { useEffect, useState } from 'react';
import { ChatScreen } from '@/chat/components/chat-screen';
import type { BackfillRunSummary } from '@/mp/domain/mp-connection';

const BACKFILL_PENDING_KEY = 'gasti-backfill-pending';

export default function Page() {
  const [backfillSummary, setBackfillSummary] = useState<BackfillRunSummary | null>(null);

  useEffect(() => {
    // sessionStorage is only available on the client; useEffect guarantees that.
    try {
      const raw = sessionStorage.getItem(BACKFILL_PENDING_KEY);
      if (!raw) return;
      sessionStorage.removeItem(BACKFILL_PENDING_KEY);
      const parsed = JSON.parse(raw) as BackfillRunSummary;
      setBackfillSummary(parsed);
    } catch {
      // Disabled storage or malformed payload — silently drop; the card just
      // won't appear, which is the correct degradation.
    }
  }, []);

  return (
    <ChatScreen
      backfillSummary={backfillSummary}
      onDismissBackfill={() => setBackfillSummary(null)}
    />
  );
}
