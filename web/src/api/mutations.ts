import {
  type QueryClient,
  useMutation,
  type UseMutationOptions,
  useQueryClient,
} from '@tanstack/react-query';
import { useRef } from 'react';

import { newIdempotencyKey } from '@/lib/idempotency';

type OptimisticMutationOpts<TData, TVariables, TSnapshot> = {
  mutationFn: (variables: TVariables, idempotencyKey: string) => Promise<TData>;
  getSnapshot: (qc: QueryClient) => TSnapshot;
  applyOptimistic: (qc: QueryClient, variables: TVariables) => void;
  rollback: (qc: QueryClient, snapshot: TSnapshot) => void;
  invalidate?: (qc: QueryClient) => void;
};

type MutationCtx<TSnapshot> = { snapshot: TSnapshot };

/**
 * Factory for mutations that opt into optimistic cache updates + stable
 * `Idempotency-Key` across React Query mutation retries (if enabled).
 */
export function createOptimisticMutation<TData, TVariables, TSnapshot>(
  opts: OptimisticMutationOpts<TData, TVariables, TSnapshot>,
) {
  return function useOptimisticMutation(
    extra?: Omit<
      UseMutationOptions<TData, Error, TVariables, MutationCtx<TSnapshot>>,
      'mutationFn' | 'onMutate' | 'onError' | 'onSettled'
    >,
  ) {
    const qc = useQueryClient();
    const idemKeyRef = useRef<string | null>(null);

    return useMutation({
      ...extra,
      mutationFn: async (variables: TVariables) => {
        if (!idemKeyRef.current) idemKeyRef.current = newIdempotencyKey();
        return opts.mutationFn(variables, idemKeyRef.current);
      },
      onMutate: async (variables) => {
        const snapshot = opts.getSnapshot(qc);
        opts.applyOptimistic(qc, variables);
        return { snapshot };
      },
      onError: (_error, _variables, context) => {
        if (context?.snapshot !== undefined) {
          opts.rollback(qc, context.snapshot);
        }
      },
      onSettled: () => {
        idemKeyRef.current = null;
        opts.invalidate?.(qc);
      },
    });
  };
}
