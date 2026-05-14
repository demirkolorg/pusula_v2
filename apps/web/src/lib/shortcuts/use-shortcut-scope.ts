'use client';

import { useEffect } from 'react';
import {
  isShortcutEditableTarget,
  normalizeShortcutEvent,
  type NormalizedShortcutEvent,
} from './keyboard';

export type ShortcutBinding = {
  id: string;
  match: (event: NormalizedShortcutEvent) => boolean;
  run: () => void;
  preventDefault?: boolean;
};

export function useShortcutScope({
  enabled,
  bindings,
}: {
  enabled: boolean;
  scope: string;
  bindings: ShortcutBinding[];
}) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isShortcutEditableTarget(event.target)) return;

      const normalized = normalizeShortcutEvent(event);
      if (normalized.isComposing) return;

      const binding = bindings.find((item) => item.match(normalized));
      if (!binding) return;

      if (binding.preventDefault !== false) event.preventDefault();
      binding.run();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, bindings]);
}
