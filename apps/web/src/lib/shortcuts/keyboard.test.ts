import { describe, expect, it, vi } from 'vitest';
import { isShortcutEditableTarget, normalizeShortcutEvent } from './keyboard';

function keyEvent(init: KeyboardEventInit) {
  return new KeyboardEvent('keydown', init);
}

describe('normalizeShortcutEvent', () => {
  it('normalizes printable keys and modifiers', () => {
    expect(normalizeShortcutEvent(keyEvent({ key: 'N' }))).toMatchObject({
      key: 'n',
      label: 'N',
      shift: false,
      ctrlOrMeta: false,
    });
    expect(normalizeShortcutEvent(keyEvent({ key: 'N', shiftKey: true }))).toMatchObject({
      key: 'n',
      shift: true,
      ctrlOrMeta: false,
    });
    expect(normalizeShortcutEvent(keyEvent({ key: '/', ctrlKey: false }))).toMatchObject({
      key: '/',
      label: '/',
      ctrlOrMeta: false,
    });
    expect(normalizeShortcutEvent(keyEvent({ key: 'K', metaKey: true }))).toMatchObject({
      key: 'k',
      meta: true,
      ctrlOrMeta: true,
    });
    expect(normalizeShortcutEvent(keyEvent({ key: ' ', ctrlKey: true }))).toMatchObject({
      key: 'space',
      label: 'Space',
      ctrl: true,
      ctrlOrMeta: true,
    });
  });

  it('marks composing events so callers can ignore them', () => {
    const event = keyEvent({ key: 'n' });
    vi.spyOn(event, 'isComposing', 'get').mockReturnValue(true);

    expect(normalizeShortcutEvent(event).isComposing).toBe(true);
  });
});

describe('isShortcutEditableTarget', () => {
  it('detects native form controls', () => {
    expect(isShortcutEditableTarget(document.createElement('input'))).toBe(true);
    expect(isShortcutEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isShortcutEditableTarget(document.createElement('select'))).toBe(true);
  });

  it('detects contenteditable and ProseMirror/Tiptap roots', () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    expect(isShortcutEditableTarget(editable)).toBe(true);

    const proseMirror = document.createElement('div');
    proseMirror.className = 'ProseMirror';
    expect(isShortcutEditableTarget(proseMirror)).toBe(true);

    const nested = document.createElement('span');
    proseMirror.appendChild(nested);
    expect(isShortcutEditableTarget(nested)).toBe(true);
  });

  it('does not block plain buttons or generic elements', () => {
    expect(isShortcutEditableTarget(document.createElement('button'))).toBe(false);
    expect(isShortcutEditableTarget(document.createElement('div'))).toBe(false);
    expect(isShortcutEditableTarget(null)).toBe(false);
  });
});
