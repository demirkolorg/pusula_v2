import { describe, expect, it } from 'vitest';
import { LIST_COLORS } from '../constants';
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
