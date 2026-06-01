import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/features/auth/stores/authStore';
import i18n from '@/i18n';
import { server } from '@/test/msw/server';
import { renderWithProviders, screen } from '@/test/utils';

import PurchaseReorderAdvisor from '../pages/PurchaseReorderAdvisor';

const API = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';

describe('W-5.8 purchase reorder advisor', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    useAuthStore.setState({ status: 'authenticated' });
    useAuthStore.getState().setPermissions([{ resource: 'ai_advisory', action: 'run' }]);
  });

  afterEach(() => {
    server.resetHandlers();
    useAuthStore.getState().clear();
  });

  it('run sends exactly one POST per submit', async () => {
    let posts = 0;
    server.use(
      http.post(`${API}/ai/advisory/purchase-reorder`, async () => {
        posts += 1;
        return HttpResponse.json({
          model: 'stub',
          generated_at: '2024-01-01T00:00:00Z',
          facts_used: {},
          suggestions: [],
        });
      }),
    );
    const u = userEvent.setup();
    renderWithProviders(<PurchaseReorderAdvisor />);
    expect(screen.queryByText(/idempotency/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Model:/i)).not.toBeInTheDocument();
    const runBtn = screen.getByRole('button', { name: /run advisor/i });
    expect(runBtn).not.toBeDisabled();
    await u.click(runBtn);
    await screen.findByText(/no suggestions/i);
    expect(posts).toBe(1);
    expect(runBtn).not.toBeDisabled();
  });

  it('does not render model metadata in the page on fallback response', async () => {
    server.use(
      http.post(`${API}/ai/advisory/purchase-reorder`, async () =>
        HttpResponse.json({
          model: 'deterministic_fallback',
          generated_at: '2026-06-01T14:23:53.490088Z',
          facts_used: {},
          suggestions: [],
        }),
      ),
    );
    const u = userEvent.setup();
    renderWithProviders(<PurchaseReorderAdvisor />);
    await u.click(screen.getByRole('button', { name: /run advisor/i }));
    await screen.findByText(/no suggestions/i);
    expect(screen.queryByText(/deterministic_fallback/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/2026-06-01T14:23:53/i)).not.toBeInTheDocument();
  });
});
