import { apiClient } from '@/api/client';
import type { paths } from '@/api/generated/schema';

type ListProductsParams = NonNullable<
  paths['/api/v1/products']['get']['parameters']['query']
>;
type ListProductsResponse =
  paths['/api/v1/products']['get']['responses']['200']['content']['application/json'];

export async function listProducts(
  params?: ListProductsParams,
): Promise<ListProductsResponse> {
  const { data } = await apiClient.get<ListProductsResponse>('/products', { params });
  return data;
}

type GetProductParams = paths['/api/v1/products/{product_id}']['get']['parameters']['path'];
type GetProductResponse =
  paths['/api/v1/products/{product_id}']['get']['responses']['200']['content']['application/json'];

export async function getProduct(path: GetProductParams): Promise<GetProductResponse> {
  const { data } = await apiClient.get<GetProductResponse>(`/products/${path.product_id}`);
  return data;
}
