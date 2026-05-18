/**
 * Chat session identity for the Mastra agent's memory.
 * `resourceId` is fixed (single-user app, matches the agent server middleware).
 * `threadId` is generated once and persisted in localStorage so a page reload
 * keeps the same conversation thread.
 */

export const RESOURCE_ID = 'default-user';

const THREAD_STORAGE_KEY = 'gasti.thread';

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Returns the persisted thread id, creating and storing one on first use. */
export function getThreadId(): string {
  if (typeof window === 'undefined') return randomId(); // SSR: throwaway, never reached client-side
  const existing = window.localStorage.getItem(THREAD_STORAGE_KEY);
  if (existing) return existing;
  const fresh = randomId();
  window.localStorage.setItem(THREAD_STORAGE_KEY, fresh);
  return fresh;
}
