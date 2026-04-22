import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './msw/server';

// jsdom shims for Radix primitives that touch layout APIs. These are no-ops
// but let Radix Select, Popover, and DropdownMenu mount without blowing up
// during a test render.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}
if (!('hasPointerCapture' in Element.prototype)) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!('releasePointerCapture' in Element.prototype)) {
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!('setPointerCapture' in Element.prototype)) {
  Element.prototype.setPointerCapture = () => undefined;
}
if (!window.PointerEvent) {
  class PointerEventPolyfill extends MouseEvent {}
  (window as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent =
    PointerEventPolyfill as unknown as typeof PointerEvent;
}
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

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
