import { beforeEach, describe, expect, it } from 'vitest';

import { LocalStorageOfflineQueue } from '@/features/pos/offline/queue';
import { tmpWatermarkFromClientUuid } from '@/features/pos/print/mapModel';

describe('POS offline queue', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('uses TMP- watermark from client uuid', () => {
    const w = tmpWatermarkFromClientUuid('abcdef12-3456-7890-abcd-ef1234567890');
    expect(w).toBe('TMP-ABCDEF12');
  });

  it('enqueues capture_finalize and lists pending', async () => {
    const q = new LocalStorageOfflineQueue();
    const clientUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const id = await q.enqueue({
      clientUuid,
      kind: 'capture_finalize',
      payload: {
        cartId: 1,
        paymentIntentId: 2,
        idempotencyKey: 'idem-1',
        method: 'cash',
        reference: null,
        cardLast4: null,
      },
    });
    const all = await q.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(id);
    expect(all[0]?.status).toBe('pending');
  });
});
