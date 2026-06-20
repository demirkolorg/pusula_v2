import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TARGET_FLASH_CLASS, useTargetFlash } from './use-target-flash';

describe('useTargetFlash', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // jsdom doesn't implement scrollIntoView — stub so the hook doesn't throw.
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function mountTarget(attribute: string, id: string): HTMLElement {
    const el = document.createElement('div');
    el.setAttribute(`data-${attribute}`, id);
    document.body.appendChild(el);
    return el;
  }

  it('scrolls to + flashes a target that is already in the DOM', async () => {
    const el = mountTarget('comment-id', 'cm1');
    renderHook(() => useTargetFlash('cm1', 'comment-id', true));

    await waitFor(() => {
      expect(el.classList.contains(TARGET_FLASH_CLASS)).toBe(true);
    });
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
  });

  it('does nothing while data is not ready', async () => {
    const el = mountTarget('comment-id', 'cm1');
    renderHook(() => useTargetFlash('cm1', 'comment-id', false));

    // Give the RAF loop a couple of frames; it should never start.
    await new Promise((r) => setTimeout(r, 50));
    expect(el.classList.contains(TARGET_FLASH_CLASS)).toBe(false);
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it('does nothing when targetId is null', async () => {
    const el = mountTarget('comment-id', 'cm1');
    renderHook(() => useTargetFlash(null, 'comment-id', true));

    await new Promise((r) => setTimeout(r, 50));
    expect(el.classList.contains(TARGET_FLASH_CLASS)).toBe(false);
  });

  it('flashes a target that mounts after the hook starts hunting (lazy race)', async () => {
    renderHook(() => useTargetFlash('at1', 'attachment-id', true));

    // Target appears only after a delay (modal lazy chunk / async query).
    await new Promise((r) => setTimeout(r, 30));
    const el = mountTarget('attachment-id', 'at1');

    await waitFor(() => {
      expect(el.classList.contains(TARGET_FLASH_CLASS)).toBe(true);
    });
  });

  it('only flashes once per target id across re-renders', async () => {
    const el = mountTarget('checklist-item-id', 'ci1');
    const { rerender } = renderHook(
      ({ ready }: { ready: boolean }) => useTargetFlash('ci1', 'checklist-item-id', ready),
      { initialProps: { ready: true } },
    );

    await waitFor(() => {
      expect(el.scrollIntoView).toHaveBeenCalledTimes(1);
    });

    // Simulate the animation ending (the hook strips the class on animationend).
    el.dispatchEvent(new Event('animationend'));
    expect(el.classList.contains(TARGET_FLASH_CLASS)).toBe(false);

    // A re-render with the same id must not re-flash.
    rerender({ ready: true });
    await new Promise((r) => setTimeout(r, 30));
    expect(el.scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
