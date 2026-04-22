import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import { type ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';

import i18n from '@/i18n';

/*
 * Test-only render helper. Wraps the tree in the same provider stack that
 * `main.tsx` uses, minus the `RouterProvider` (tests use `MemoryRouter` so
 * they can seed the URL directly).
 */

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  {
    initialEntries = ['/'],
    queryClient = createTestQueryClient(),
    ...renderOptions
  }: RenderOptions & { initialEntries?: string[]; queryClient?: QueryClient } = {},
) {
  return {
    queryClient,
    ...render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
        </QueryClientProvider>
      </I18nextProvider>,
      renderOptions,
    ),
  };
}

export { screen, waitFor, within } from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
