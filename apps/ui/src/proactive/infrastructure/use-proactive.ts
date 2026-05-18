'use client';

import { useContext } from 'react';
import { ProactiveContext, type ProactiveContextValue } from '@/proactive/infrastructure/proactive-context';

export function useProactive(): ProactiveContextValue {
  const ctx = useContext(ProactiveContext);
  if (!ctx) throw new Error('useProactive must be used inside <ProactiveProvider>');
  return ctx;
}
