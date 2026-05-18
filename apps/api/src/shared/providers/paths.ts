import path from 'node:path';

// This file: apps/api/src/shared/providers/paths.ts
const API_ROOT = path.resolve(__dirname, '../../..'); // apps/api
const REPO_ROOT = path.resolve(API_ROOT, '../..'); // repo root

export const TRANSACTIONS_FILE =
  process.env.TRANSACTIONS_FILE || path.join(REPO_ROOT, 'data/transactions.json');

export const DATA_DIR = process.env.API_DATA_DIR || path.join(API_ROOT, 'data');

// Resolved lazily (per call, not at module load) so a repository instantiated
// after the env var is set — e.g. a test pointing at a temp file — picks it up
// regardless of module import order.
export const usersFile = (): string =>
  process.env.USERS_FILE || path.join(DATA_DIR, 'users.json');

export const pendingPromptsFile = (): string =>
  process.env.PENDING_PROMPTS_FILE || path.join(DATA_DIR, 'pending-prompts.json');
