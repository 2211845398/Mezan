/** W-9-ready offline queue contract (W-5.1: localStorage + in-memory). */

import { now, toISOStringUtc } from '@/lib/date';

export type OfflineOpId = string;

export type CaptureFinalizePayload = {
  cartId: number;
  paymentIntentId: number;
  /** Shared across capture + finalize retries for this tender attempt. */
  idempotencyKey: string;
  method: 'cash' | 'card' | 'transfer' | 'other';
  reference?: string | null;
  cardLast4?: string | null;
};

export type ReturnSubmitPayload = {
  invoice_barcode: string;
  reason?: string | null;
  lines: { sales_invoice_line_id: number; qty: number }[];
  exchange_cart_id?: number | null;
  shift_id?: number | null;
  return_cart_line_ids?: number[];
  /** Reserved for future server idempotency; stored for replay metadata. */
  clientUuid: string;
};

export type OfflineOp =
  | {
      id: OfflineOpId;
      clientUuid: string;
      kind: 'capture_finalize';
      status: 'pending' | 'synced' | 'failed';
      serverId?: string;
      failureReason?: string;
      createdAt: string;
      payload: CaptureFinalizePayload;
    }
  | {
      id: OfflineOpId;
      clientUuid: string;
      kind: 'return_submit';
      status: 'pending' | 'synced' | 'failed';
      serverId?: string;
      failureReason?: string;
      createdAt: string;
      payload: ReturnSubmitPayload;
    };

export type OfflineEnqueueInput =
  | {
      clientUuid: string;
      kind: 'capture_finalize';
      payload: CaptureFinalizePayload;
      id?: OfflineOpId;
    }
  | {
      clientUuid: string;
      kind: 'return_submit';
      payload: ReturnSubmitPayload;
      id?: OfflineOpId;
    };

export interface OfflineQueue {
  enqueue(op: OfflineEnqueueInput): Promise<OfflineOpId>;
  list(): Promise<OfflineOp[]>;
  markSynced(id: OfflineOpId, serverId: string): Promise<void>;
  markFailed(id: OfflineOpId, reason: string): Promise<void>;
}

const LS_KEY = 'mezan.pos.offline.queue';

function readAll(): OfflineOp[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as OfflineOp[]) : [];
  } catch {
    return [];
  }
}

function writeAll(ops: OfflineOp[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LS_KEY, JSON.stringify(ops));
}

export class LocalStorageOfflineQueue implements OfflineQueue {
  async enqueue(op: OfflineEnqueueInput): Promise<OfflineOpId> {
    const id = op.id ?? crypto.randomUUID();
    const row: OfflineOp = {
      ...op,
      id,
      status: 'pending',
      createdAt: toISOStringUtc(now()),
    } as OfflineOp;
    const all = readAll();
    all.push(row);
    writeAll(all);
    return id;
  }

  async list(): Promise<OfflineOp[]> {
    return readAll();
  }

  async markSynced(id: OfflineOpId, serverId: string): Promise<void> {
    const all = readAll();
    const next = all.map((o) =>
      o.id === id ? { ...o, status: 'synced' as const, serverId } : o,
    );
    writeAll(next);
  }

  async markFailed(id: OfflineOpId, reason: string): Promise<void> {
    const all = readAll();
    const next = all.map((o) =>
      o.id === id ? { ...o, status: 'failed' as const, failureReason: reason } : o,
    );
    writeAll(next);
  }
}

export class IndexedDbOfflineQueue implements OfflineQueue {
  enqueue(input: OfflineEnqueueInput): Promise<OfflineOpId> {
    void input;
    throw new Error('NotImplementedError: IndexedDB offline queue lands in W-9 (Dexie).');
  }

  list(): Promise<OfflineOp[]> {
    throw new Error('NotImplementedError: IndexedDB offline queue lands in W-9 (Dexie).');
  }

  markSynced(id: OfflineOpId, serverId: string): Promise<void> {
    void id;
    void serverId;
    throw new Error('NotImplementedError: IndexedDB offline queue lands in W-9 (Dexie).');
  }

  markFailed(id: OfflineOpId, reason: string): Promise<void> {
    void id;
    void reason;
    throw new Error('NotImplementedError: IndexedDB offline queue lands in W-9 (Dexie).');
  }
}
