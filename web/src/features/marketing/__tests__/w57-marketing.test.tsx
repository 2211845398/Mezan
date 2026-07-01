import { http, HttpResponse } from 'msw';
import { afterEach,beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/features/auth/stores/authStore';
import i18n from '@/i18n';
import { server } from '@/test/msw/server';
import { renderWithProviders, screen, userEvent } from '@/test/utils';

import MarketingAdvisory from '../pages/advisory/MarketingAdvisory';
import CampaignAdvisor from '../pages/campaigns/CampaignAdvisor';

const API = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';

describe('W-5.7 marketing', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    server.resetHandlers();
    useAuthStore.getState().clear();
  });

  it('marketing advisory: shows friendly error on failed run', async () => {
    useAuthStore.setState({ status: 'authenticated' });
    useAuthStore.getState().setPermissions([{ resource: 'marketing_advisory', action: 'run' }]);
    server.use(
      http.get(`${API}/branches`, () => HttpResponse.json([])),
      http.post(`${API}/marketing/advisory/suggestions`, () =>
        HttpResponse.json({ detail: 'Advisory validation failed' }, { status: 422 }),
      ),
    );
    const u = userEvent.setup();
    renderWithProviders(<MarketingAdvisory />);
    await u.click(screen.getByRole('button', { name: /run advisor/i }));
    expect(await screen.findByText(/could not load advisory results/i)).toBeInTheDocument();
  });

  it('marketing advisory: shows AI suggestions and facts summary on success', async () => {
    useAuthStore.setState({ status: 'authenticated' });
    useAuthStore.getState().setPermissions([{ resource: 'marketing_advisory', action: 'run' }]);
    server.use(
      http.get(`${API}/branches`, () => HttpResponse.json([])),
      http.post(`${API}/marketing/advisory/suggestions`, () =>
        HttpResponse.json({
          model: 'gpt-4o-mini',
          generated_at: '2024-01-01T00:00:00Z',
          facts_used: {
            analysis_period: { lookback_days: 30 },
            sales_summary: { invoice_count: 12, avg_basket: '45.50' },
            customer_aggregates: { active_customers: 8, repeat_rate_pct: 25 },
            top_selling_products: [{ product_name: 'Bread' }],
            slow_moving_products: [],
            expiring_inventory: [],
            co_bought_pairs: [],
            promotion_performance: [],
          },
          suggestions: [
            {
              title: 'عرض تجميعي',
              rationale: 'منتجان يُشتريان معاً بكثرة.',
              action_items: ['أنشئ عرض كمبو'],
              priority: 'high',
              confidence: 0.9,
            },
          ],
        }),
      ),
    );
    const u = userEvent.setup();
    renderWithProviders(<MarketingAdvisory />);
    await u.click(screen.getByRole('button', { name: /run advisor/i }));
    expect(await screen.findByText(/analyzed by gpt-4o-mini/i)).toBeInTheDocument();
    expect(screen.getByText(/data used in this run/i)).toBeInTheDocument();
    expect(screen.getByText('عرض تجميعي')).toBeInTheDocument();
  });

  it('marketing advisory: shows fallback badge when model is deterministic', async () => {
    useAuthStore.setState({ status: 'authenticated' });
    useAuthStore.getState().setPermissions([{ resource: 'marketing_advisory', action: 'run' }]);
    server.use(
      http.get(`${API}/branches`, () => HttpResponse.json([])),
      http.post(`${API}/marketing/advisory/suggestions`, () =>
        HttpResponse.json({
          model: 'deterministic_fallback',
          generated_at: '2024-01-01T00:00:00Z',
          facts_used: {
            analysis_period: { lookback_days: 30 },
            top_selling_products: [],
            slow_moving_products: [],
            expiring_inventory: [],
            co_bought_pairs: [],
            promotion_performance: [],
          },
          suggestions: [
            {
              title: 'اقتراح محلي',
              rationale: 'سبب',
              action_items: ['خطوة'],
              priority: 'medium',
              confidence: 0.7,
            },
          ],
        }),
      ),
    );
    const u = userEvent.setup();
    renderWithProviders(<MarketingAdvisory />);
    await u.click(screen.getByRole('button', { name: /run advisor/i }));
    expect(await screen.findByText(/local fallback suggestions/i)).toBeInTheDocument();
    expect(screen.getByText('اقتراح محلي')).toBeInTheDocument();
  });

  it('campaign advisor: empty campaigns shows empty state', async () => {
    useAuthStore.setState({ status: 'authenticated' });
    useAuthStore.getState().setPermissions([{ resource: 'ai_advisory', action: 'run' }]);
    server.use(
      http.post(`${API}/ai/advisory/campaigns`, () =>
        HttpResponse.json({
          model: 'test',
          generated_at: '2024-01-01T00:00:00Z',
          facts_used: {},
          campaigns: [],
        }),
      ),
    );
    const u = userEvent.setup();
    renderWithProviders(<CampaignAdvisor />);
    await u.click(screen.getByRole('button', { name: /generate campaigns/i }));
    expect(await screen.findByText(/no campaigns returned/i)).toBeInTheDocument();
  });
});
