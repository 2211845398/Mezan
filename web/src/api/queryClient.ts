import { QueryClient } from '@tanstack/react-query';

import { is4xx } from '@/api/errors';

/*
 * Shared TanStack Query defaults (Plan §5.3).
 *
 * - staleTime 30 s: balances chatter vs freshness on listing screens.
 * - retry: only for non-4xx, max 2 attempts. We never retry validation errors.
 * - refetchOnWindowFocus: operators alt-tab often; freshness wins. Heavy
 *   routes (e.g. `/dashboard`) may override `staleTime` per-query — see
 *   `features/bi/queries.ts` executive KPIs.
 * - networkMode: 'offlineFirst' so POS and catalog stay usable on flaky nets.
 * - mutations: never auto-retry; Idempotency-Key protects explicit retries.
 */

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, err) => count < 2 && !is4xx(err),
        refetchOnWindowFocus: true,
        networkMode: 'offlineFirst',
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export const queryClient: QueryClient = createQueryClient();
