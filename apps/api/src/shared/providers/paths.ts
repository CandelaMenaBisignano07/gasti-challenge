import path from 'node:path';

// This file: apps/api/src/shared/providers/paths.ts
const API_ROOT = path.resolve(__dirname, '../../..'); // apps/api
const REPO_ROOT = path.resolve(API_ROOT, '../..'); // repo root

export const TRANSACTIONS_FILE =
  process.env.TRANSACTIONS_FILE || path.join(REPO_ROOT, 'data/transactions.json');

export const DATA_DIR = process.env.API_DATA_DIR || path.join(API_ROOT, 'data');
