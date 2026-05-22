'use client';

import Link from 'next/link';
import { Settings } from 'lucide-react';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 bg-surface-1/80 backdrop-blur border-b border-line-1">
      <div className="mx-auto max-w-[720px] flex items-center justify-between px-5 h-14">
        <Link
          href="/"
          className="font-display text-[18px] font-semibold text-ink-1 tracking-tight"
        >
          Gasti
        </Link>
        <Link
          href="/settings/categories"
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-pill text-[13px] text-ai-ink hover:bg-ai-soft transition-colors"
        >
          <Settings size={16} strokeWidth={1.6} />
          Configuración
        </Link>
      </div>
    </header>
  );
}
