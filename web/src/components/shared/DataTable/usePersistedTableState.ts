import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import type { DataTableState } from './types';

/*
 * Persist per-route-path UI preferences (density, column visibility) in
 * `localStorage` under a key that mirrors the URL path. This is a UX
 * preference, not data, so it's fine outside the query cache.
 */

const KEY_PREFIX = 'mezan.table.';

function safeParse(raw: string | null, fallback: DataTableState): DataTableState {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<DataTableState>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

export function usePersistedTableState(initial: DataTableState): [
  DataTableState,
  {
    setDensity: (d: DataTableState['density']) => void;
    setColumnVisibility: (v: DataTableState['columnVisibility']) => void;
  },
] {
  const { pathname } = useLocation();
  const key = `${KEY_PREFIX}${pathname}`;

  const [state, setState] = useState<DataTableState>(() => {
    if (typeof window === 'undefined') return initial;
    return safeParse(window.localStorage.getItem(key), initial);
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // localStorage full / disabled — fall back to in-memory only.
    }
  }, [key, state]);

  const setDensity = useCallback(
    (density: DataTableState['density']) => setState((s) => ({ ...s, density })),
    [],
  );
  const setColumnVisibility = useCallback(
    (columnVisibility: DataTableState['columnVisibility']) =>
      setState((s) => ({ ...s, columnVisibility })),
    [],
  );

  return [state, { setDensity, setColumnVisibility }];
}
