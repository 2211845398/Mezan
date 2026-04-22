import '@/styles/index.css';
import '@/i18n';
// Initialising the API client at module load registers all interceptors.
import '@/api/client';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';

import App from '@/App';
import I18nProvider from '@/providers/I18nProvider';
import QueryProvider from '@/providers/QueryProvider';
import ThemeProvider from '@/providers/ThemeProvider';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <QueryProvider>
          <App />
          <Toaster position="top-center" richColors closeButton />
        </QueryProvider>
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
);
