import type { paths } from '@/api/generated/schema';

/** JSON body of a GET endpoint's 200 response. */
type GetJson200<Path extends keyof paths> = paths[Path] extends {
  get: { responses: { 200: { content: { 'application/json': infer Body } } } };
}
  ? Body
  : never;

/** Item type when the list endpoint returns `{ items, total, limit, offset }`. */
export type PaginatedItem<Path extends keyof paths> = GetJson200<Path> extends {
  items: (infer Item)[];
}
  ? Item
  : never;

/** Full paginated list response for a GET list endpoint. */
export type PaginatedBody<Path extends keyof paths> = GetJson200<Path> extends {
  items: unknown[];
  total: number;
}
  ? GetJson200<Path>
  : never;
