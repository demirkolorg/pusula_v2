import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// --- jsdom polyfills for Radix UI primitives -------------------------------
// jsdom doesn't implement Pointer Capture or `Element.scrollIntoView`, which
// `@radix-ui/react-select` (and other Radix components) call when a user opens
// a popover / picks an option. Without these, interacting with a `<Select>` in
// a test throws. These are no-op shims — enough to let RTL drive the component.
if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

// `@radix-ui/react-tooltip` (and other Radix primitives) observe element size
// via `ResizeObserver`, which jsdom doesn't implement. A no-op shim is enough
// for RTL to drive these components.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverShim {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverShim as unknown as typeof ResizeObserver;
}
