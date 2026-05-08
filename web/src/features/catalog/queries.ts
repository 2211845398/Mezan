import { useQuery } from '@tanstack/react-query';

import type { ProductRead } from './api';
import {
  getCategory,
  getCategoryTree,
  getProduct,
  listCategories,
  listCategoryAttributes,
  listProducts,
} from './api';

export const catalogKeys = {
  root: ['catalog'] as const,
  products: (q: Record<string, unknown>) => [...catalogKeys.root, 'products', q] as const,
  product: (id: number) => [...catalogKeys.root, 'product', id] as const,
  categoryTree: () => [...catalogKeys.root, 'categoryTree'] as const,
  categories: (parentId: number | null) => [...catalogKeys.root, 'categories', { parentId }] as const,
  category: (id: number) => [...catalogKeys.root, 'category', id] as const,
  categoryAttrs: (id: number, includeInherited?: boolean) =>
    [...catalogKeys.root, 'categoryAttrs', id, { includeInherited: includeInherited ?? true }] as const,
};

export type ListProductsParams = {
  q?: string;
  category_id?: number;
  category_include_descendants?: boolean;
  status?: string;
  limit: number;
  offset: number;
};

function buildListParams(p: ListProductsParams): Parameters<typeof listProducts>[0] {
  const o: Parameters<typeof listProducts>[0] = { limit: p.limit, offset: p.offset };
  if (p.q !== undefined) {
    o.q = p.q;
  }
  if (p.category_id !== undefined) {
    o.category_id = p.category_id;
  }
  if (p.category_include_descendants !== undefined) {
    o.category_include_descendants = p.category_include_descendants;
  }
  if (p.status !== undefined) {
    o.status = p.status;
  }
  return o;
}

/** Used by POS product search (W-5.1) and catalog lists. */
export function useProducts(
  params: ListProductsParams,
  options?: { enabled?: boolean },
): ReturnType<typeof useQuery<ProductRead[]>> {
  return useQuery({
    queryKey: catalogKeys.products(params as unknown as Record<string, unknown>),
    queryFn: () => listProducts(buildListParams(params)),
    enabled: options?.enabled ?? true,
  });
}

export function useProductListQuery(params: {
  q?: string;
  category_id?: number;
  category_include_descendants?: boolean;
  status?: string | null;
  limit: number;
  offset: number;
}) {
  const q = params.q;
  const category_id = params.category_id;
  const category_include_descendants = params.category_include_descendants;
  const status = params.status ?? undefined;
  return useQuery({
    queryKey: catalogKeys.products({
      q,
      category_id,
      category_include_descendants,
      status,
      limit: params.limit,
      offset: params.offset,
    }),
    queryFn: () =>
      listProducts(
        buildListParams({
          limit: params.limit,
          offset: params.offset,
          ...(q !== undefined ? { q } : {}),
          ...(category_id !== undefined ? { category_id } : {}),
          ...(category_include_descendants !== undefined ? { category_include_descendants } : {}),
          ...(status !== undefined ? { status } : {}),
        }),
      ),
  });
}

export function useProductQuery(id: number | null) {
  return useQuery({
    queryKey: catalogKeys.product(id ?? 0),
    queryFn: () => getProduct(id!),
    enabled: id != null,
  });
}

export function useCategoryTreeQuery() {
  return useQuery({ queryKey: catalogKeys.categoryTree(), queryFn: getCategoryTree });
}

export function useCategoriesQuery(parentId: number | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: catalogKeys.categories(parentId),
    queryFn: () => listCategories(parentId ?? undefined),
    enabled: options?.enabled ?? true,
  });
}

export function useCategoryQuery(id: number | null) {
  return useQuery({
    queryKey: catalogKeys.category(id ?? 0),
    queryFn: () => getCategory(id!),
    enabled: id != null,
  });
}

export function useCategoryAttributesQuery(
  categoryId: number | null,
  opts?: { includeInherited?: boolean },
) {
  const includeInherited = opts?.includeInherited ?? true;
  return useQuery({
    queryKey: catalogKeys.categoryAttrs(categoryId ?? 0, includeInherited),
    queryFn: () => listCategoryAttributes(categoryId!, { includeInherited }),
    enabled: categoryId != null,
  });
}
