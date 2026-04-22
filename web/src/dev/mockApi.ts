/**
 * Dev-only MSW bootstrap. Imported dynamically from `main.tsx` when
 * `VITE_ENABLE_MOCK_API=true` so production bundles never pull MSW.
 */
export async function registerMockApi(): Promise<void> {
  const { worker } = await import('@/test/msw/browser');
  await worker.start({
    onUnhandledRequest: 'bypass',
  });
}
