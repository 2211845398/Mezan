import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/api/client';
import { server } from '@/test/msw/server';

import type { CategoryTreeNode, ProductRead } from '../api';

const API = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';

describe('W-5.3 catalog API wiring', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it('listProducts is called after MSW /products', async () => {
    const mod = await import('../api');
    server.use(
      http.get(`${API}/products`, () =>
        HttpResponse.json({
          items: [
            {
              id: 1,
              category_id: 1,
              name: 'Test',
              sku: 'T1',
              status: 'active',
              output_vat_rate: '0',
              tax_definition_ids: [],
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
            },
          ],
          total: 1,
          limit: 10,
          offset: 0,
        }),
      ),
    );
    const rows = await mod.listProducts({ limit: 10, offset: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sku).toBe('T1');
  });

  it('listProducts forwards category_include_descendants', async () => {
    const mod = await import('../api');
    const captured = { url: null as URL | null };
    server.use(
      http.get(`${API}/products`, ({ request }) => {
        captured.url = new URL(request.url);
        return HttpResponse.json({ items: [], total: 0, limit: 10, offset: 0 });
      }),
    );
    await mod.listProducts({
      limit: 10,
      offset: 0,
      category_id: 5,
      category_include_descendants: true,
    });
    expect(captured.url?.searchParams.get('category_include_descendants')).toBe('true');
  });

  it('ProductCategoryChips shows primary and tag labels', async () => {
    const { render, screen } = await import('@testing-library/react');
    const { ProductCategoryChips } = await import('../components/ProductCategoryChips');

    const nameById = new Map<number, string>([
      [1, 'Primary'],
      [2, 'Tag'],
    ]);
    const product = {
      id: 9,
      category_id: 1,
      category_ids: [1, 2],
      name: 'P',
      sku: 'S',
      status: 'active',
      output_vat_rate: '0',
      tax_definition_ids: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    } as unknown as ProductRead;

    render(<ProductCategoryChips product={product} nameById={nameById} />);
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('Tag')).toBeInTheDocument();
  });

  it('filterActiveCategoryTree removes inactive nodes', async () => {
    const { filterActiveCategoryTree } = await import('../utils/categoryTree');
    const tree = [
      {
        id: 1,
        name: 'A',
        slug: 'a',
        sort_order: 0,
        is_active: true,
        parent_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        children: [
          {
            id: 2,
            name: 'B',
            slug: 'b',
            sort_order: 0,
            is_active: false,
            parent_id: 1,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            children: [],
          },
        ],
      },
    ];
    const out = filterActiveCategoryTree(tree as unknown as CategoryTreeNode[]);
    expect(out).toHaveLength(1);
    expect(out[0]?.children ?? []).toHaveLength(0);
  });

  it('uploadCategoryImage posts to /categories/images and returns image_url', async () => {
    const mod = await import('../api');
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { image_url: '/api/v1/static/catalog-category-images/abc.jpg' },
    });
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'x.jpg', { type: 'image/jpeg' });
    const res = await mod.uploadCategoryImage(file);
    expect(post).toHaveBeenCalledWith('/categories/images', expect.any(FormData));
    expect(res.image_url).toContain('catalog-category-images');
    post.mockRestore();
  });

  it('listCatalogAttributes calls GET /catalog/attributes', async () => {
    const mod = await import('../api');
    server.use(
      http.get(`${API}/catalog/attributes`, () =>
        HttpResponse.json([
          { id: 1, code: 'color', name: 'Color', sort_order: 0, metadata: null },
        ]),
      ),
    );
    const rows = await mod.listCatalogAttributes();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.code).toBe('color');
  });

  it('previewGenerateVariants posts axes to preview-generate', async () => {
    const mod = await import('../api');
    server.use(
      http.post(`${API}/products/6/variants/preview-generate`, async ({ request }) => {
        const body = (await request.json()) as { axes: Record<string, number[]> };
        expect(body.axes['1']).toEqual([10, 11]);
        return HttpResponse.json({
          rows: [
            {
              attribute_value_ids: [10, 20],
              suggested_sku: 'PRD-6-RED-S',
              display_label: 'Shirt — Red — S',
              exists: false,
              attribute_summary: [],
            },
          ],
          count: 1,
        });
      }),
    );
    const res = await mod.previewGenerateVariants(6, { 1: [10, 11] });
    expect(res.count).toBe(1);
    expect(res.rows[0]?.suggested_sku).toBe('PRD-6-RED-S');
  });

  it('uploadProductImage posts to /products/images and returns image_url', async () => {
    const mod = await import('../api');
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { image_url: '/api/v1/static/catalog-product-images/p1.jpg' },
    });
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'x.jpg', { type: 'image/jpeg' });
    const res = await mod.uploadProductImage(file);
    expect(post).toHaveBeenCalledWith('/products/images', expect.any(FormData));
    expect(res.image_url).toContain('catalog-product-images');
    post.mockRestore();
  });
});
