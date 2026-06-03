/**
 * Dev-only MSW bootstrap. Imported dynamically from `main.tsx` when
 * `VITE_ENABLE_MOCK_API=true` so production bundles never pull MSW.
 *
 * Requires `public/mockServiceWorker.js` — generate once with:
 *   pnpm exec msw init public --save
 */
export async function registerMockApi(): Promise<void> {
  const { worker } = await import('@/test/msw/browser');
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: {
      url: `${import.meta.env.BASE_URL}mockServiceWorker.js`,
    },
  });
}
