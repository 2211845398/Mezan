import { apiClient } from '@/api/client';
import type { components, paths } from '@/api/generated/schema';

type ProductReadBase = paths['/api/v1/products']['get']['responses']['200']['content']['application/json'][number];
type ProductCreateBase = paths['/api/v1/products']['post']['requestBody']['content']['application/json'];
type ProductUpdateBase = paths['/api/v1/products/{product_id}']['patch']['requestBody']['content']['application/json'];

export type ProductRead = ProductReadBase & { tax_definition_ids?: number[] };
export type ProductCreate = ProductCreateBase & { tax_definition_ids?: number[] | null };
export type ProductUpdate = ProductUpdateBase & { tax_definition_ids?: number[] | null };
type CategoryRead = paths['/api/v1/categories']['get']['responses']['200']['content']['application/json'][number];
type CategoryCreate = paths['/api/v1/categories']['post']['requestBody']['content']['application/json'];
type CategoryUpdate = paths['/api/v1/categories/{category_id}']['patch']['requestBody']['content']['application/json'];
type CategoryTreeNode = paths['/api/v1/categories/tree']['get']['responses']['200']['content']['application/json'][number];
type AttrDef = paths['/api/v1/categories/{category_id}/attributes']['get']['responses']['200']['content']['application/json'][number];
export type CategoryAttrDef = AttrDef;
type AttrDefCreate = paths['/api/v1/categories/{category_id}/attributes']['post']['requestBody']['content']['application/json'];
type AttrDefUpdate =
  paths['/api/v1/categories/{category_id}/attributes/{attr_id}']['patch']['requestBody']['content']['application/json'];

export type {
  AttrDef,
  CategoryCreate,
  CategoryRead,
  CategoryTreeNode,
  CategoryUpdate,
};

export type TaxDefinitionRead = {
  id: number;
  name: string;
  code: string | null;
  rate: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TaxDefinitionCreateBody = {
  name: string;
  code?: string | null;
  rate: string | number;
  is_active?: boolean;
};

export type TaxDefinitionUpdateBody = {
  name?: string | null;
  code?: string | null;
  rate?: string | number | null;
  is_active?: boolean | null;
};

export async function listTaxDefinitions(includeInactive = true): Promise<TaxDefinitionRead[]> {
  const { data } = await apiClient.get<TaxDefinitionRead[]>('/tax-definitions', {
    params: { include_inactive: includeInactive },
  });
  return data;
}

export async function createTaxDefinition(body: TaxDefinitionCreateBody): Promise<TaxDefinitionRead> {
  const { data } = await apiClient.post<TaxDefinitionRead>('/tax-definitions', body);
  return data;
}

export async function updateTaxDefinition(
  id: number,
  body: TaxDefinitionUpdateBody,
): Promise<TaxDefinitionRead> {
  const { data } = await apiClient.patch<TaxDefinitionRead>(`/tax-definitions/${id}`, body);
  return data;
}

export async function archiveTaxDefinition(id: number): Promise<TaxDefinitionRead> {
  const { data } = await apiClient.delete<TaxDefinitionRead>(`/tax-definitions/${id}`);
  return data;
}

export type ProductVariantPurchasingSearchItem =
  components['schemas']['ProductVariantPurchasingSearchItem'];

export async function searchProductVariantsForPurchasing(params: {
  q: string;
  limit?: number;
  offset?: number;
}): Promise<ProductVariantPurchasingSearchItem[]> {
  const { data } = await apiClient.get<ProductVariantPurchasingSearchItem[]>('/product-variants/search', {
    params,
  });
  return data;
}

export type ProductWithVariantsVariantRow = {
  id: number;
  sku: string;
  barcode: string | null;
  attribute_values: Record<string, unknown> | null;
  active: boolean;
};

export type ProductWithVariantsResponse = {
  product: ProductRead;
  variants: ProductWithVariantsVariantRow[];
  variant_count: number;
};

export async function getProductWithVariants(productId: number): Promise<ProductWithVariantsResponse> {
  const { data } = await apiClient.get<ProductWithVariantsResponse>(`/products/${productId}/with-variants`);
  return data;
}

export async function listProducts(params: {
  q?: string;
  category_id?: number;
  category_include_descendants?: boolean;
  status?: string;
  branch_id?: number;
  in_stock_only?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ProductRead[]> {
  const { data } = await apiClient.get<ProductRead[]>('/products', { params });
  return data;
}

function productListTotalFromHeaders(headers: Record<string, unknown>, rowCount: number): number {
  const get =
    headers && typeof (headers as { get?: (name: string) => string | undefined }).get === 'function'
      ? (headers as { get: (name: string) => string | undefined }).get.bind(headers)
      : (name: string) => {
          const v = (headers as Record<string, string | undefined>)[name];
          return typeof v === 'string' ? v : undefined;
        };
  const raw = get('x-total-count') ?? get('X-Total-Count');
  const n = raw != null && raw !== '' ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) ? n : rowCount;
}

/** Same as {@link listProducts} plus total row count from `X-Total-Count` (catalog list pagination). */
export async function listProductsWithTotal(params: {
  q?: string;
  category_id?: number;
  category_include_descendants?: boolean;
  status?: string;
  branch_id?: number;
  in_stock_only?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ items: ProductRead[]; total: number }> {
  const res = await apiClient.get<ProductRead[]>('/products', { params });
  const items = res.data;
  const total = productListTotalFromHeaders(res.headers as Record<string, unknown>, items.length);
  return { items, total };
}

export async function getProduct(id: number): Promise<ProductRead> {
  const { data } = await apiClient.get<ProductRead>(`/products/${id}`);
  return data;
}

export async function createProduct(body: ProductCreate): Promise<ProductRead> {
  const { data } = await apiClient.post<ProductRead>('/products', body);
  return data;
}

export async function updateProduct(id: number, body: ProductUpdate): Promise<ProductRead> {
  const { data } = await apiClient.patch<ProductRead>(`/products/${id}`, body);
  return data;
}

export async function postArchiveProduct(id: number): Promise<ProductRead> {
  const { data } = await apiClient.post<ProductRead>(`/products/${id}/archive`);
  return data;
}

export async function postUnarchiveProduct(id: number): Promise<ProductRead> {
  const { data } = await apiClient.post<ProductRead>(`/products/${id}/unarchive`);
  return data;
}

export async function postGenerateBarcode(id: number): Promise<ProductRead> {
  const { data } = await apiClient.post<ProductRead>(`/products/${id}/barcode`);
  return data;
}

export async function getCategoryTree(): Promise<CategoryTreeNode[]> {
  const { data } = await apiClient.get<CategoryTreeNode[]>('/categories/tree');
  return data;
}

export async function listCategories(parent_id?: number | null): Promise<CategoryRead[]> {
  const { data } = await apiClient.get<CategoryRead[]>('/categories', { params: { parent_id } });
  return data;
}

export async function getCategory(id: number): Promise<CategoryRead> {
  const { data } = await apiClient.get<CategoryRead>(`/categories/${id}`);
  return data;
}

export async function createCategory(body: CategoryCreate): Promise<CategoryRead> {
  const { data } = await apiClient.post<CategoryRead>('/categories', body);
  return data;
}

export async function updateCategory(id: number, body: CategoryUpdate): Promise<CategoryRead> {
  const { data } = await apiClient.patch<CategoryRead>(`/categories/${id}`, body);
  return data;
}

export type CategoryImageUploadResponse = { image_url: string };

export async function uploadCategoryImage(file: File): Promise<CategoryImageUploadResponse> {
  const body = new FormData();
  body.append('file', file);
  const { data } = await apiClient.post<CategoryImageUploadResponse>('/categories/images', body);
  return data;
}

export type ProductImageUploadResponse = { image_url: string };

export async function uploadProductImage(file: File): Promise<ProductImageUploadResponse> {
  const body = new FormData();
  body.append('file', file);
  const { data } = await apiClient.post<ProductImageUploadResponse>('/products/images', body);
  return data;
}

export async function deleteCategory(id: number): Promise<void> {
  await apiClient.delete(`/categories/${id}`);
}

export async function listCategoryAttributes(
  categoryId: number,
  opts?: { includeInherited?: boolean },
): Promise<CategoryAttrDef[]> {
  const { data } = await apiClient.get<CategoryAttrDef[]>(`/categories/${categoryId}/attributes`, {
    params: { include_inherited: opts?.includeInherited ?? false },
  });
  return data;
}

export async function createCategoryAttribute(
  categoryId: number,
  body: AttrDefCreate,
): Promise<AttrDef> {
  const { data } = await apiClient.post<AttrDef>(`/categories/${categoryId}/attributes`, body);
  return data;
}

export async function updateCategoryAttribute(
  categoryId: number,
  attrId: number,
  body: AttrDefUpdate,
): Promise<AttrDef> {
  const { data } = await apiClient.patch<AttrDef>(
    `/categories/${categoryId}/attributes/${attrId}`,
    body,
  );
  return data;
}

export async function deleteCategoryAttribute(categoryId: number, attrId: number): Promise<void> {
  await apiClient.delete(`/categories/${categoryId}/attributes/${attrId}`);
}

export function getDisplayPrice(p: ProductRead): string {
  const attrs = p.attributes as { price?: number } | undefined;
  if (attrs && typeof attrs.price === 'number') {
    return String(attrs.price);
  }
  return '—';
}

export function getBarcodeCount(p: ProductRead): number {
  return p.barcode ? 1 : 0;
}
