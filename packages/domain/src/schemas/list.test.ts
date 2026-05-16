import { describe, expect, it } from 'vitest';
import { LIST_COLORS, LIST_ICON_COLORS, LIST_ICONS } from '../constants';
import { updateListInput } from './list';

describe('LIST_COLORS', () => {
  it('exports the fixed 10-colour list palette', () => {
    expect(LIST_COLORS).toEqual([
      'yesil',
      'sari',
      'turuncu',
      'kirmizi',
      'mor',
      'mavi',
      'sky',
      'lime',
      'pembe',
      'gri',
    ]);
    expect(new Set(LIST_COLORS).size).toBe(10);
  });
});

describe('LIST_ICONS', () => {
  it('exports the fixed curated list icon set', () => {
    expect(LIST_ICONS).toEqual([
      'circle',
      'circle-dot',
      'circle-dashed',
      'circle-check',
      'circle-alert',
      'check',
      'square-check',
      'list',
      'list-todo',
      'list-checks',
      'layers',
      'play',
      'pause',
      'hourglass',
      'timer',
      'alarm-clock',
      'star',
      'flag',
      'bookmark',
      'tag',
      'pin',
      'sparkles',
      'lightbulb',
      'heart',
      'thumbs-up',
      'clock',
      'calendar',
      'user',
      'users',
      'bell',
      'message-square',
      'mail',
      'briefcase',
      'target',
      'rocket',
      'zap',
      'trophy',
      'award',
      'trending-up',
      'activity',
      'folder',
      'file-text',
      'paperclip',
      'inbox',
      'archive',
      'package',
      'triangle-alert',
      'lock',
      'bug',
      'wrench',
      'hammer',
      'gift',
      'coffee',
    ]);
    expect(new Set(LIST_ICONS).size).toBe(53);
  });
});

describe('LIST_ICON_COLORS', () => {
  it('exports the fixed 12-colour list icon palette', () => {
    expect(LIST_ICON_COLORS).toEqual([
      'kirmizi',
      'turuncu',
      'sari',
      'lime',
      'yesil',
      'sky',
      'mavi',
      'indigo',
      'mor',
      'pembe',
      'gri',
      'siyah',
    ]);
    expect(new Set(LIST_ICON_COLORS).size).toBe(12);
  });
});

describe('updateListInput', () => {
  it('accepts a valid list colour as an update field', () => {
    expect(updateListInput.parse({ listId: 'list_1', color: 'yesil' })).toEqual({
      listId: 'list_1',
      color: 'yesil',
    });
  });

  it('accepts null to clear a list colour', () => {
    expect(updateListInput.parse({ listId: 'list_1', color: null })).toEqual({
      listId: 'list_1',
      color: null,
    });
  });

  it('rejects invalid list colours', () => {
    expect(updateListInput.safeParse({ listId: 'list_1', color: 'indigo' }).success).toBe(false);
  });

  it('accepts a valid list icon as an update field', () => {
    expect(updateListInput.parse({ listId: 'list_1', icon: 'star' })).toEqual({
      listId: 'list_1',
      icon: 'star',
    });
  });

  it('accepts null to clear a list icon', () => {
    expect(updateListInput.parse({ listId: 'list_1', icon: null })).toEqual({
      listId: 'list_1',
      icon: null,
    });
  });

  it('rejects invalid list icons', () => {
    expect(updateListInput.safeParse({ listId: 'list_1', icon: 'smile' }).success).toBe(false);
  });

  it('accepts a valid list icon colour as an update field', () => {
    expect(updateListInput.parse({ listId: 'list_1', iconColor: 'mavi' })).toEqual({
      listId: 'list_1',
      iconColor: 'mavi',
    });
  });

  it('accepts null to clear a list icon colour', () => {
    expect(updateListInput.parse({ listId: 'list_1', iconColor: null })).toEqual({
      listId: 'list_1',
      iconColor: null,
    });
  });

  it('rejects invalid list icon colours', () => {
    expect(updateListInput.safeParse({ listId: 'list_1', iconColor: 'green' }).success).toBe(false);
  });

  it('requires at least one mutable field', () => {
    expect(updateListInput.safeParse({ listId: 'list_1' }).success).toBe(false);
  });

  it('still accepts title renames', () => {
    expect(updateListInput.parse({ listId: 'list_1', title: '  Yeni liste  ' })).toEqual({
      listId: 'list_1',
      title: 'Yeni liste',
    });
  });
});
