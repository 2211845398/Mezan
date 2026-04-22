import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './msw/server';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  // Tests that manipulate sessionStorage (auth store boot sequence) need a
  // clean slate per-test. localStorage is cleared for i18n language detection.
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterAll(() => {
  server.close();
});
