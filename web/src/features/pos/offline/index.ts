import { env } from '@/config/env';

import {
  IndexedDbOfflineQueue,
  LocalStorageOfflineQueue,
  type OfflineQueue,
} from './queue';

let singleton: OfflineQueue | null = null;

export function getOfflineQueue(): OfflineQueue {
  if (singleton) return singleton;
  singleton =
    env.VITE_POS_OFFLINE_DRIVER === 'indexeddb'
      ? new IndexedDbOfflineQueue()
      : new LocalStorageOfflineQueue();
  return singleton;
}

export type { OfflineOp, OfflineOpId, OfflineQueue } from './queue';
