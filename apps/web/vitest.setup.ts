import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, vi } from 'vitest';

vi.mock('lottie-react', () => ({
  default: ({
    animationData,
    autoplay,
    loop,
    className,
  }: {
    animationData?: { nm?: string };
    autoplay?: boolean;
    loop?: boolean;
    className?: string;
  }) =>
    createElement('div', {
      'aria-hidden': 'true',
      className,
      'data-animation-name': animationData?.nm,
      'data-autoplay': String(autoplay),
      'data-loop': String(loop),
      'data-testid': 'lottie-player',
    }),
}));

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

// `motion`'ın `useInView` hook'u (ör. `/sign-in` istatistik şeridi) viewport
// kesişimini `IntersectionObserver` ile izler — jsdom bunu sağlamaz. No-op
// shim mount'u geçirir; testler kesişimi tetiklemediğinden count-up animasyonu
// görsel kalır, render edilen son değer/etiketler yine doğrulanabilir.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class IntersectionObserverShim {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: ReadonlyArray<number> = [];
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  globalThis.IntersectionObserver =
    IntersectionObserverShim as unknown as typeof IntersectionObserver;
}

// --- jsdom polyfills for ProseMirror / Tiptap ------------------------------
// ProseMirror measures DOM rects when computing selections/coordinates, which
// jsdom stubs out (or omits entirely). These zero-rect shims are enough to let
// RTL mount and drive a Tiptap editor without throwing.
if (typeof globalThis.DOMRect === 'undefined') {
  class DOMRectShim {
    x = 0;
    y = 0;
    width = 0;
    height = 0;
    top = 0;
    right = 0;
    bottom = 0;
    left = 0;
    constructor(x = 0, y = 0, width = 0, height = 0) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
      this.top = y;
      this.left = x;
      this.right = x + width;
      this.bottom = y + height;
    }
    toJSON() {
      return { ...this };
    }
    static fromRect(r?: { x?: number; y?: number; width?: number; height?: number }) {
      return new DOMRectShim(r?.x, r?.y, r?.width, r?.height);
    }
  }
  globalThis.DOMRect = DOMRectShim as unknown as typeof DOMRect;
}

if (typeof Range !== 'undefined') {
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  }
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () =>
      ({
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* () {},
      }) as unknown as DOMRectList;
  }
}

if (typeof document !== 'undefined' && !document.elementFromPoint) {
  document.elementFromPoint = () => null;
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
