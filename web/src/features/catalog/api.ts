import { apiClient } from '@/api/client';
import type { paths } from '@/api/generated/schema';

type ProductRead = paths['/api/v1/products']['get']['responses']['200']['content']['application/json'][number];
type ProductCreate = paths['/api/v1/products']['post']['requestBody']['content']['application/json'];
type ProductUpdate = paths['/api/v1/products/{product_id}']['patch']['requestBody']['content']['application/json'];
type CategoryRead = paths['/api/v1/categories']['get']['responses']['200']['content']['application/json'][number];
type CategoryCreate = paths['/api/v1/categories']['post']['requestBody']['content']['application/json'];
type CategoryUpdate = paths['/api/v1/categories/{category_id}']['patch']['requestBody']['content']['application/json'];
type CategoryTreeNode = paths['/api/v1/categories/tree']['get']['responses']['200']['content']['application/json'][number];
type AttrDef = paths['/api/v1/categories/{category_id}/attributes']['get']['responses']['200']['content']['application/json'][number];
type AttrDefCreate = paths['/api/v1/categories/{category_id}/attributes']['post']['requestBody']['content']['application/json'];
type AttrDefUpdate =
  paths['/api/v1/categories/{category_id}/attributes/{attr_id}']['patch']['requestBody']['content']['application/json'];
export type PriceListSummary =
  paths['/api/v1/price-lists']['get']['responses']['200']['content']['application/json'][number];
type PriceListRead = paths['/api/v1/price-lists/{price_list_id}']['get']['responses']['200']['content']['application/json'];
type PriceListCreate = paths['/api/v1/price-lists']['post']['requestBody']['content']['application/json'];
type PriceListUpdate = paths['/api/v1/price-lists/{price_list_id}']['patch']['requestBody']['content']['application/json'];
type PriceListLineCreate =
  paths['/api/v1/price-lists/{price_list_id}/lines']['post']['requestBody']['content']['application/json'];
type PriceListLineUpdate =
  paths['/api/v1/price-lists/{price_list_id}/lines/{line_id}']['patch']['requestBody']['content']['application/json'];

export type {
  AttrDef,
  CategoryCreate,
  CategoryRead,
  CategoryTreeNode,
  CategoryUpdate,
  PriceListRead,
  ProductCreate,
  ProductRead,
  ProductUpdate,
};

export async function listProducts(params: {
  q?: string;
  category_id?: number;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<ProductRead[]> {
  const { data } = await apiClient.get<ProductRead[]>('/products', { params });
  return data;
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

export async function deleteCategory(id: number): Promise<void> {
  await apiClient.delete(`/categories/${id}`);
}

export async function listCategoryAttributes(categoryId: number): Promise<AttrDef[]> {
  const { data } = await apiClient.get<AttrDef[]>(`/categories/${categoryId}/attributes`);
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

export async function listPriceLists(params?: { limit?: number; offset?: number }): Promise<PriceListSummary[]> {
  const { data } = await apiClient.get<PriceListSummary[]>('/price-lists', { params });
  return data;
}

export async function getPriceList(id: number): Promise<PriceListRead> {
  const { data } = await apiClient.get<PriceListRead>(`/price-lists/${id}`);
  return data;
}

export async function createPriceList(body: PriceListCreate): Promise<PriceListRead> {
  const { data } = await apiClient.post<PriceListRead>('/price-lists', body);
  return data;
}

export async function updatePriceList(id: number, body: PriceListUpdate): Promise<PriceListRead> {
  const { data } = await apiClient.patch<PriceListRead>(`/price-lists/${id}`, body);
  return data;
}

export async function addPriceListLine(priceListId: number, body: PriceListLineCreate): Promise<PriceListRead> {
  const { data } = await apiClient.post<PriceListRead>(`/price-lists/${priceListId}/lines`, body);
  return data;
}

export async function patchPriceListLine(
  priceListId: number,
  lineId: number,
  body: PriceListLineUpdate,
): Promise<PriceListRead> {
  const { data } = await apiClient.patch<PriceListRead>(
    `/price-lists/${priceListId}/lines/${lineId}`,
    body,
  );
  return data;
}

export async function deletePriceListLine(priceListId: number, lineId: number): Promise<void> {
  await apiClient.delete(`/price-lists/${priceListId}/lines/${lineId}`);
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
