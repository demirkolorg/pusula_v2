/**
 * Schema tests for the Hızlı Not (quick-note) domain inputs — DEM-203 WP7.
 *
 * These are pure Zod tests (no DB): they pin the `content` trim / min(1) /
 * max(500) discipline and the id-field / optional-`clientMutationId` shapes of
 * the four `quickNote` router inputs.
 */
import { describe, expect, it } from 'vitest';
import {
  convertQuickNoteToCardInput,
  createQuickNoteInput,
  deleteQuickNoteInput,
  quickNoteContentSchema,
  updateQuickNoteInput,
} from './quick-note';

describe('quickNoteContentSchema', () => {
  it('trims surrounding whitespace from a valid body', () => {
    expect(quickNoteContentSchema.parse('  buy milk  ')).toBe('buy milk');
  });

  it('accepts a single-character body (min = 1 after trim)', () => {
    expect(quickNoteContentSchema.parse('x')).toBe('x');
  });

  it('accepts a 500-character body (the max)', () => {
    const body = 'a'.repeat(500);
    expect(quickNoteContentSchema.parse(body)).toBe(body);
  });

  it('rejects an empty string', () => {
    expect(() => quickNoteContentSchema.parse('')).toThrow();
  });

  it('rejects a whitespace-only string (trim leaves it empty)', () => {
    expect(() => quickNoteContentSchema.parse('   ')).toThrow();
    expect(() => quickNoteContentSchema.parse('\n\t  ')).toThrow();
  });

  it('rejects a body longer than 500 characters', () => {
    expect(() => quickNoteContentSchema.parse('a'.repeat(501))).toThrow();
  });

  it('rejects a body that is > 500 chars only before trimming would not save it', () => {
    // 500 real chars + surrounding spaces: trim runs, result is exactly 500 → OK.
    const body = `  ${'a'.repeat(500)}  `;
    expect(quickNoteContentSchema.parse(body)).toBe('a'.repeat(500));
  });

  it('rejects a non-string body', () => {
    expect(() => quickNoteContentSchema.parse(123)).toThrow();
    expect(() => quickNoteContentSchema.parse(null)).toThrow();
    expect(() => quickNoteContentSchema.parse(undefined)).toThrow();
  });
});

describe('createQuickNoteInput', () => {
  it('accepts a single `content` field and trims it', () => {
    expect(createQuickNoteInput.parse({ content: '  note  ' })).toEqual({ content: 'note' });
  });

  it('rejects a missing `content` field', () => {
    expect(() => createQuickNoteInput.parse({})).toThrow();
  });

  it('rejects an empty `content` field', () => {
    expect(() => createQuickNoteInput.parse({ content: '   ' })).toThrow();
  });
});

describe('updateQuickNoteInput', () => {
  it('accepts a `noteId` + `content` pair', () => {
    expect(updateQuickNoteInput.parse({ noteId: 'qn_1', content: 'edited' })).toEqual({
      noteId: 'qn_1',
      content: 'edited',
    });
  });

  it('rejects a missing `noteId`', () => {
    expect(() => updateQuickNoteInput.parse({ content: 'edited' })).toThrow();
  });

  it('rejects an empty `noteId` (idSchema min = 1)', () => {
    expect(() => updateQuickNoteInput.parse({ noteId: '', content: 'edited' })).toThrow();
  });

  it('rejects an empty `content`', () => {
    expect(() => updateQuickNoteInput.parse({ noteId: 'qn_1', content: '  ' })).toThrow();
  });
});

describe('deleteQuickNoteInput', () => {
  it('accepts a single `noteId`', () => {
    expect(deleteQuickNoteInput.parse({ noteId: 'qn_1' })).toEqual({ noteId: 'qn_1' });
  });

  it('rejects a missing `noteId`', () => {
    expect(() => deleteQuickNoteInput.parse({})).toThrow();
  });

  it('rejects an empty `noteId`', () => {
    expect(() => deleteQuickNoteInput.parse({ noteId: '' })).toThrow();
  });
});

describe('convertQuickNoteToCardInput', () => {
  it('accepts `noteId` + `listId` without a `clientMutationId`', () => {
    expect(convertQuickNoteToCardInput.parse({ noteId: 'qn_1', listId: 'list_1' })).toEqual({
      noteId: 'qn_1',
      listId: 'list_1',
    });
  });

  it('accepts an optional `clientMutationId` (UUID)', () => {
    const cmid = '11111111-1111-4111-8111-111111111111';
    expect(
      convertQuickNoteToCardInput.parse({ noteId: 'qn_1', listId: 'list_1', clientMutationId: cmid }),
    ).toEqual({ noteId: 'qn_1', listId: 'list_1', clientMutationId: cmid });
  });

  it('rejects a non-UUID `clientMutationId`', () => {
    expect(() =>
      convertQuickNoteToCardInput.parse({
        noteId: 'qn_1',
        listId: 'list_1',
        clientMutationId: 'not-a-uuid',
      }),
    ).toThrow();
  });

  it('rejects a missing `noteId`', () => {
    expect(() => convertQuickNoteToCardInput.parse({ listId: 'list_1' })).toThrow();
  });

  it('rejects a missing `listId`', () => {
    expect(() => convertQuickNoteToCardInput.parse({ noteId: 'qn_1' })).toThrow();
  });

  // DEM-205 — web "Hızlı Notlar" panel drag-to-list adds optional placement.
  it('accepts placement neighbours + `newPosition` (DEM-205)', () => {
    expect(
      convertQuickNoteToCardInput.parse({
        noteId: 'qn_1',
        listId: 'list_1',
        beforeCardId: 'card_a',
        afterCardId: 'card_b',
        newPosition: 'a4',
      }),
    ).toEqual({
      noteId: 'qn_1',
      listId: 'list_1',
      beforeCardId: 'card_a',
      afterCardId: 'card_b',
      newPosition: 'a4',
    });
  });

  it('accepts `null` placement neighbours (idSchema.nullish — end of list)', () => {
    expect(
      convertQuickNoteToCardInput.parse({
        noteId: 'qn_1',
        listId: 'list_1',
        beforeCardId: null,
        afterCardId: null,
      }),
    ).toEqual({ noteId: 'qn_1', listId: 'list_1', beforeCardId: null, afterCardId: null });
  });

  it('rejects an empty `beforeCardId` (idSchema min = 1)', () => {
    expect(() =>
      convertQuickNoteToCardInput.parse({ noteId: 'qn_1', listId: 'list_1', beforeCardId: '' }),
    ).toThrow();
  });

  it('rejects a non-string `newPosition`', () => {
    expect(() =>
      convertQuickNoteToCardInput.parse({ noteId: 'qn_1', listId: 'list_1', newPosition: 4 }),
    ).toThrow();
  });
});
