export type NormalizedShortcutEvent = {
  key: string;
  label: string;
  shift: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  ctrlOrMeta: boolean;
  isComposing: boolean;
};

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function normalizeShortcutEvent(event: KeyboardEvent): NormalizedShortcutEvent {
  const rawKey = event.key === ' ' ? 'space' : event.key.toLocaleLowerCase('tr');
  const label = event.key === ' ' ? 'Space' : event.key;

  return {
    key: rawKey,
    label,
    shift: event.shiftKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    alt: event.altKey,
    ctrlOrMeta: event.ctrlKey || event.metaKey,
    isComposing: event.isComposing,
  };
}

export function isShortcutEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const element = target as HTMLElement;

  if (EDITABLE_TAGS.has(element.tagName)) return true;
  if (element.isContentEditable) return true;
  if (element.closest('[contenteditable="true"]')) return true;
  if (element.closest('.ProseMirror')) return true;
  if (element.closest('[data-shortcut-editable="true"]')) return true;

  return false;
}
