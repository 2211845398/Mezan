/** Matches backend `PaginatedListResponse` (items, total, limit, offset). */

export type PaginatedList<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

export const DEFAULT_LIST_PAGE_SIZE = 20;

export function paginatedParams(page: number, pageSize: number): { limit: number; offset: number } {
  const ps = Math.max(1, pageSize);
  const p = Math.max(1, page);
  return { limit: ps, offset: (p - 1) * ps };
}
