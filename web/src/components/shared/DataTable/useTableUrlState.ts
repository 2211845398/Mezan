import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { SortState, UrlQuery } from './types';

/*
 * Sync pagination, sorting, and search against the URL. URL is the source of
 * truth so deep-linking a filtered view works out of the box.
 *
 * Encoding:
 *   ?page=1
 *   &pageSize=20
 *   &sort=column:asc  (or  column:desc ;  empty = no sort)
 *   &q=free-text-search
 */

function parseSort(raw: string | null): SortState {
  if (!raw) return null;
  const [id, dir] = raw.split(':');
  if (!id) return null;
  return { id, desc: dir === 'desc' };
}

function stringifySort(s: SortState): string | null {
  if (!s) return null;
  return `${s.id}:${s.desc ? 'desc' : 'asc'}`;
}

export function useTableUrlState(defaults?: Partial<UrlQuery>): [
  UrlQuery,
  {
    setPage: (n: number) => void;
    setPageSize: (n: number) => void;
    setSort: (s: SortState) => void;
    setQ: (q: string) => void;
  },
] {
  const [searchParams, setSearchParams] = useSearchParams();

  const query: UrlQuery = useMemo(() => {
    const p = Number.parseInt(searchParams.get('page') ?? '', 10);
    const ps = Number.parseInt(searchParams.get('pageSize') ?? '', 10);
    return {
      page: Number.isFinite(p) && p > 0 ? p : (defaults?.page ?? 1),
      pageSize:
        Number.isFinite(ps) && ps > 0 ? ps : (defaults?.pageSize ?? 20),
      sort: parseSort(searchParams.get('sort')) ?? defaults?.sort ?? null,
      q: searchParams.get('q') ?? defaults?.q ?? '',
    };
  }, [searchParams, defaults?.page, defaults?.pageSize, defaults?.sort, defaults?.q]);

  const update = useCallback(
    (patch: Partial<Record<keyof UrlQuery, string | null>>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return [
    query,
    {
      setPage: (n) => update({ page: n > 1 ? String(n) : null }),
      setPageSize: (n) => update({ pageSize: String(n), page: null }),
      setSort: (s) => update({ sort: stringifySort(s) }),
      setQ: (q) => update({ q: q || null, page: null }),
    },
  ];
}
