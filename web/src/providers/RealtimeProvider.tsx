import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useAuthStore } from '@/features/auth/stores/authStore';

import { invalidateNavBadgeKinds, isNavBadgeKind } from '@/hooks/navBadgeInvalidation';

const MIN_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

type RealtimeEnvelope = {
  event?: string;
  kinds?: string[];
};

/**
 * Subscribes to `/api/v1/realtime/events` and invalidates nav badge queries on push.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const accessToken = useAuthStore((s) => s.accessToken);
  const reconnectMs = useRef(MIN_RECONNECT_MS);

  useEffect(() => {
    if (status !== 'authenticated' || !accessToken) {
      return;
    }

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      const url = `/api/v1/realtime/events?access_token=${encodeURIComponent(accessToken)}`;
      source = new EventSource(url);

      source.onopen = () => {
        reconnectMs.current = MIN_RECONNECT_MS;
      };

      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as RealtimeEnvelope;
          if (payload.event !== 'nav_badges_invalidate' || !Array.isArray(payload.kinds)) {
            return;
          }
          const kinds = payload.kinds.filter(isNavBadgeKind);
          if (kinds.length > 0) {
            invalidateNavBadgeKinds(queryClient, kinds);
          }
        } catch {
          // ignore malformed frames
        }
      };

      source.onerror = () => {
        source?.close();
        source = null;
        if (closed) return;
        const delay = reconnectMs.current;
        reconnectMs.current = Math.min(reconnectMs.current * 2, MAX_RECONNECT_MS);
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [accessToken, queryClient, status]);

  return <>{children}</>;
}

export default RealtimeProvider;
