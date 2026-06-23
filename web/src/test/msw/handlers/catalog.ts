import { http, HttpResponse } from 'msw';

const BASE = '/api/v1';

const ts = '2024-01-01T00:00:00Z';

export const MOCK_CATEGORY_TREE = [
  {
    id: 1,
    parent_id: null,
    name: 'Beverages',
    slug: 'beverages',
    sort_order: 0,
    is_active: true,
    image_url: null,
    created_at: ts,
    updated_at: ts,
    direct_product_count: 1,
    children: [
      {
        id: 2,
        parent_id: 1,
        name: 'Soft drinks',
        slug: 'soft-drinks',
        sort_order: 0,
        is_active: true,
        image_url: null,
        created_at: ts,
        updated_at: ts,
        direct_product_count: 0,
        children: [],
      },
    ],
  },
  {
    id: 3,
    parent_id: null,
    name: 'Food',
    slug: 'food',
    sort_order: 1,
    is_active: true,
    image_url: null,
    created_at: ts,
    updated_at: ts,
    direct_product_count: 0,
    children: [],
  },
];

export const MOCK_CATEGORY = {
  id: 1,
  parent_id: null,
  name: 'Beverages',
  slug: 'beverages',
  sort_order: 0,
  is_active: true,
  image_url: null,
  created_at: ts,
  updated_at: ts,
};

let categoryState = { ...MOCK_CATEGORY };

export function resetMockCategoryState() {
  categoryState = { ...MOCK_CATEGORY };
}

export const catalogHandlers = [
  http.get(`${BASE}/categories/tree`, () => HttpResponse.json(MOCK_CATEGORY_TREE)),
  http.get(`${BASE}/categories/:categoryId`, ({ params }) => {
    const id = Number(params.categoryId);
    if (id === categoryState.id) {
      return HttpResponse.json(categoryState);
    }
    const node = MOCK_CATEGORY_TREE.flatMap((n) => [n, ...(n.children ?? [])]).find((c) => c.id === id);
    if (!node) {
      return HttpResponse.json({ detail: 'Not found' }, { status: 404 });
    }
    const { children: _c, direct_product_count: _d, ...rest } = node;
    return HttpResponse.json(rest);
  }),
  http.get(`${BASE}/categories`, ({ request }) => {
    const url = new URL(request.url);
    const parentId = url.searchParams.get('parent_id');
    if (parentId === '1') {
      return HttpResponse.json([
        {
          id: 2,
          parent_id: 1,
          name: 'Soft drinks',
          slug: 'soft-drinks',
          sort_order: 0,
          is_active: true,
          image_url: null,
          created_at: ts,
          updated_at: ts,
        },
      ]);
    }
    return HttpResponse.json([]);
  }),
  http.patch(`${BASE}/categories/:categoryId`, async ({ request, params }) => {
    const id = Number(params.categoryId);
    if (id !== categoryState.id) {
      return HttpResponse.json({ detail: 'Not found' }, { status: 404 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    categoryState = {
      ...categoryState,
      ...body,
      parent_id: (body.parent_id as number | null | undefined) ?? categoryState.parent_id,
    };
    return HttpResponse.json(categoryState);
  }),
];
