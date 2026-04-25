import { http, HttpResponse } from 'msw';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

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
