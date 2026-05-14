import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

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
        HttpResponse.json([
          {
            id: 1,
            category_id: 1,
            name: 'Test',
            sku: 'T1',
            status: 'active',
            output_vat_rate: '0',
            attributes: { price: 9.99 },
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ]),
      ),
    );
    const rows = await mod.listProducts({ limit: 10, offset: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sku).toBe('T1');
  });

  it('listProducts forwards category_include_descendants', async () => {
    const mod = await import('../api');
<<<<<<< HEAD
    const captured = { url: null as URL | null };
    server.use(
      http.get(`${API}/products`, ({ request }) => {
        captured.url = new URL(request.url);
=======
    const captured: { requestUrl: string | null } = { requestUrl: null };
    server.use(
      http.get(`${API}/products`, ({ request }) => {
        captured.requestUrl = request.url;
>>>>>>> e2f16e40c4347e52c0d01e289337a3c8c209c915
        return HttpResponse.json([]);
      }),
    );
    await mod.listProducts({
      limit: 10,
      offset: 0,
      category_id: 5,
      category_include_descendants: true,
    });
<<<<<<< HEAD
    expect(captured.url?.searchParams.get('category_include_descendants')).toBe('true');
=======
    expect(captured.requestUrl).toBeTruthy();
    expect(new URL(captured.requestUrl!).searchParams.get('category_include_descendants')).toBe(
      'true',
    );
>>>>>>> e2f16e40c4347e52c0d01e289337a3c8c209c915
  });

  it('ProductCategoryChips shows primary and tag labels', async () => {
    const { render, screen } = await import('@testing-library/react');
    const { ProductCategoryChips } = await import('../components/ProductCategoryChips');

    const nameById = new Map<number, string>([
      [1, 'Primary'],
      [2, 'Tag'],
    ]);
    const product: ProductRead = {
      id: 9,
      category_id: 1,
      category_ids: [1, 2],
      name: 'P',
      sku: 'S',
      status: 'active',
      output_vat_rate: '0',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

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
    const out = filterActiveCategoryTree(tree as CategoryTreeNode[]);
    expect(out).toHaveLength(1);
    expect(out[0]?.children ?? []).toHaveLength(0);
  });

  it('uploadCategoryImage posts to /categories/images and returns image_url', async () => {
    const mod = await import('../api');
    server.use(
      http.post(`${API}/categories/images`, () =>
        HttpResponse.json({ image_url: '/api/v1/static/catalog-category-images/abc.jpg' }),
      ),
    );
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'x.jpg', { type: 'image/jpeg' });
    const res = await mod.uploadCategoryImage(file);
    expect(res.image_url).toContain('catalog-category-images');
  });

  it('uploadProductImage posts to /products/images and returns image_url', async () => {
    const mod = await import('../api');
    server.use(
      http.post(`${API}/products/images`, () =>
        HttpResponse.json({ image_url: '/api/v1/static/catalog-product-images/p1.jpg' }),
      ),
    );
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'x.jpg', { type: 'image/jpeg' });
    const res = await mod.uploadProductImage(file);
    expect(res.image_url).toContain('catalog-product-images');
  });
});
