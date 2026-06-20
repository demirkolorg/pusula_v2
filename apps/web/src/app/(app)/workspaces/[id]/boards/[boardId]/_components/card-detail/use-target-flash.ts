'use client';

import { useEffect, useRef } from 'react';

/**
 * CSS class that runs the `--animate-target-flash` keyframe (theme.css). Applied
 * imperatively (not via React state) so the flash can fire exactly when the
 * target DOM node mounts — even if that happens after the modal's lazy chunk +
 * its queries resolve. `prefers-reduced-motion` is honoured by the global
 * `@media` reset in theme.css (animation collapses to ~0ms → effectively no
 * flash), so no per-call guard is needed here.
 */
export const TARGET_FLASH_CLASS = 'pusula-target-flash';

/** Strip the flash class once its animation ends, so a re-flash can re-trigger. */
function clearFlash(element: HTMLElement): void {
  element.classList.remove(TARGET_FLASH_CLASS);
}

/**
 * Scroll a deep-link target into view + play a one-shot "flash" on it.
 *
 * Notification deep-links carry a focus id (`comment` / `checklistItem` /
 * `attachment`); the modal is lazy + its data loads async, so the target node
 * isn't in the DOM on first render. This hook polls (via `requestAnimationFrame`,
 * bounded) for `[data-${attribute}="${targetId}"]` and, the moment it appears,
 * scrolls it to centre and flashes it **once**. If the target never materialises
 * (deleted comment, stale link), it gives up silently after the deadline.
 *
 * @param targetId   The focus id from the URL, or `null` when there's nothing to
 *                   focus. Changing it re-arms the effect (new deep-link).
 * @param attribute  The `data-*` attribute the target node carries
 *                   (e.g. `comment-id`, `checklist-item-id`, `attachment-id`).
 * @param ready      Whether the relevant data has loaded. The hook only starts
 *                   hunting once this is `true`, avoiding a pointless poll while
 *                   the modal is still in its loading state.
 */
export function useTargetFlash(
  targetId: string | null | undefined,
  attribute: string,
  ready: boolean,
): void {
  // Guards a single fire per (targetId) so React 18 strict-mode double-invoke,
  // re-renders or query refetches can't replay the flash.
  const firedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!targetId || !ready) return;
    if (firedForRef.current === targetId) return;

    let rafId = 0;
    let cancelled = false;
    // Bounded hunt — ~2.5s of frames. Covers the lazy-chunk + query settle
    // window without leaking a forever-running RAF loop if the target is gone.
    const deadline = performance.now() + 2500;
    const selector = `[data-${attribute}="${cssEscape(targetId)}"]`;

    const hunt = () => {
      if (cancelled) return;
      const node = document.querySelector<HTMLElement>(selector);
      if (node) {
        firedForRef.current = targetId;
        node.scrollIntoView({ block: 'center', behavior: 'smooth' });
        // Restart the animation cleanly if the class lingered from a prior run.
        node.classList.remove(TARGET_FLASH_CLASS);
        // Force reflow so removing + re-adding the class re-triggers the keyframe.
        void node.offsetWidth;
        node.classList.add(TARGET_FLASH_CLASS);
        const onEnd = () => {
          clearFlash(node);
          node.removeEventListener('animationend', onEnd);
        };
        node.addEventListener('animationend', onEnd);
        return;
      }
      if (performance.now() < deadline) {
        rafId = requestAnimationFrame(hunt);
      }
    };

    rafId = requestAnimationFrame(hunt);
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [targetId, attribute, ready]);
}

/**
 * Minimal CSS attribute-selector escape for ids that may contain quotes/special
 * chars. Card/comment ids are UUIDs in practice, but a deep-link is
 * user-influenced, so escape defensively. Uses the native `CSS.escape` when
 * available, falling back to a backslash-escape of the risky characters.
 */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\\]]/g, '\\$&');
}
