import '@/styles/index.css';
import '@/i18n';
// Initialising the API client at module load registers all interceptors.
import '@/api/client';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';

import { env } from '@/config/env';
import AuthBoundary from '@/providers/AuthBoundary';
import I18nProvider from '@/providers/I18nProvider';
import QueryProvider from '@/providers/QueryProvider';
import ThemeProvider from '@/providers/ThemeProvider';
import { router } from '@/routes/router';

async function bootstrap() {
  if (env.VITE_ENABLE_MOCK_API) {
    const { registerMockApi } = await import('@/dev/mockApi');
    await registerMockApi();
  }

  const rootEl = document.getElementById('root');
  if (!rootEl) {
    throw new Error('Root element #root not found in index.html');
  }

  createRoot(rootEl).render(
    <StrictMode>
      <I18nProvider>
        <ThemeProvider>
          <QueryProvider>
            <AuthBoundary>
              <RouterProvider router={router} />
            </AuthBoundary>
            <Toaster position="top-center" richColors closeButton />
          </QueryProvider>
        </ThemeProvider>
      </I18nProvider>
    </StrictMode>,
  );
}

void bootstrap();
