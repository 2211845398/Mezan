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
export type CategoryAttrDef = AttrDef;
type AttrDefCreate = paths['/api/v1/categories/{category_id}/attributes']['post']['requestBody']['content']['application/json'];
type AttrDefUpdate =
  paths['/api/v1/categories/{category_id}/attributes/{attr_id}']['patch']['requestBody']['content']['application/json'];

export type {
  AttrDef,
  CategoryAttrDef,
  CategoryCreate,
  CategoryRead,
  CategoryTreeNode,
  CategoryUpdate,
  ProductCreate,
  ProductRead,
  ProductUpdate,
};

export async function listProducts(params: {
  q?: string;
  category_id?: number;
  category_include_descendants?: boolean;
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
