import { useEffect, useState } from 'react';

import { getOfflineQueue } from '@/features/pos/offline';

/**
 * Count of POS offline operations not yet marked synced.
 */
export function usePendingOps(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const q = getOfflineQueue();
    let cancelled = false;

    async function refresh() {
      const ops = await q.list();
      const pending = ops.filter((o) => o.status === 'pending').length;
      if (!cancelled) setCount(pending);
    }

    void refresh();
    const id = window.setInterval(() => void refresh(), 2000);
    const onVis = () => void refresh();
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return count;
}
