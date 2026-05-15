/**
 * Tests for the optional `clientMutationId` field on collaborative mutation
 * input schemas (Phase 4A — DEM-78). The contract:
 *
 * - The field is OPTIONAL — clients may omit it, the server still works.
 *   (Phase 4C UI emits one for every collaborative mutation, but optionality
 *   keeps tests / server-to-server callers simple, and back-compat after
 *   Phase 5 outbox + short-window dedupe is added.)
 * - When present, it MUST be a valid UUID — Phase 4 client uses
 *   `crypto.randomUUID()` (UUID v4), but the schema accepts any UUID format
 *   (matching the karar kaydı 2026-05-13 literal spec
 *   `z.string().uuid().optional()`).
 * - It is in scope on every board / list / card *collaborative* mutation in
 *   Phase 4 (see `docs/architecture/05-board-mekanigi.md` §5.2 "Kapsam (Faz 4)"
 *   and karar kaydı 2026-05-13). Comment / checklist / label / member inputs
 *   are out of scope (Phase 5/6).
 */
import { describe, expect, it } from 'vitest';
import {
  archiveBoardInput,
  archiveCardInput,
  archiveListInput,
  clientMutationIdSchema,
  completeCardInput,
  copyCardInput,
  createBoardInput,
  createCardInput,
  createListInput,
  moveCardInput,
  moveCardToListInput,
  moveListInput,
  renameListInput,
  uncompleteCardInput,
  updateBoardInput,
  updateCardInput,
} from './index';

const VALID_UUID = '04378dc1-3fd0-4042-b5df-5d456e145056';
const ANOTHER_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('clientMutationIdSchema', () => {
  it('accepts a valid UUID', () => {
    expect(clientMutationIdSchema.parse(VALID_UUID)).toBe(VALID_UUID);
  });

  it('rejects non-UUID strings (legacy `cmid_xxx` is no longer valid)', () => {
    expect(clientMutationIdSchema.safeParse('cmid_abcdefghij').success).toBe(false);
    expect(clientMutationIdSchema.safeParse('').success).toBe(false);
    expect(clientMutationIdSchema.safeParse('not-a-uuid').success).toBe(false);
    expect(clientMutationIdSchema.safeParse('1234').success).toBe(false);
  });
});

/**
 * Phase 4A scope — board / list / card collaborative mutations. Each must:
 *   1. parse a minimal input WITHOUT `clientMutationId` (optional);
 *   2. parse the same input WITH a valid UUID;
 *   3. reject a non-UUID `clientMutationId`.
 *
 * The "minimal input" is the smallest object that satisfies the schema's
 * required keys *other* than `clientMutationId`.
 */
const cases: Array<{
  name: string;
  schema: { safeParse: (v: unknown) => { success: boolean } };
  minimal: Record<string, unknown>;
}> = [
  {
    name: 'createBoardInput',
    schema: createBoardInput,
    minimal: { workspaceId: 'ws_1', title: 'B' },
  },
  { name: 'updateBoardInput', schema: updateBoardInput, minimal: { boardId: 'b_1', title: 'B2' } },
  { name: 'archiveBoardInput', schema: archiveBoardInput, minimal: { boardId: 'b_1' } },
  { name: 'createListInput', schema: createListInput, minimal: { boardId: 'b_1', title: 'L' } },
  { name: 'renameListInput', schema: renameListInput, minimal: { listId: 'l_1', title: 'L2' } },
  { name: 'moveListInput', schema: moveListInput, minimal: { boardId: 'b_1', listId: 'l_1' } },
  { name: 'archiveListInput', schema: archiveListInput, minimal: { listId: 'l_1' } },
  { name: 'createCardInput', schema: createCardInput, minimal: { listId: 'l_1', title: 'C' } },
  { name: 'updateCardInput', schema: updateCardInput, minimal: { cardId: 'c_1', title: 'C2' } },
  { name: 'archiveCardInput', schema: archiveCardInput, minimal: { cardId: 'c_1' } },
  { name: 'completeCardInput', schema: completeCardInput, minimal: { cardId: 'c_1' } },
  { name: 'uncompleteCardInput', schema: uncompleteCardInput, minimal: { cardId: 'c_1' } },
  {
    name: 'moveCardInput',
    schema: moveCardInput,
    minimal: { cardId: 'c_1', fromListId: 'l_1', toListId: 'l_2' },
  },
  {
    name: 'moveCardToListInput',
    schema: moveCardToListInput,
    minimal: { cardId: 'c_1', toListId: 'l_2' },
  },
  { name: 'copyCardInput', schema: copyCardInput, minimal: { cardId: 'c_1', toListId: 'l_2' } },
];

for (const { name, schema, minimal } of cases) {
  describe(`${name} — clientMutationId`, () => {
    it('parses without clientMutationId (optional)', () => {
      expect(schema.safeParse(minimal).success).toBe(true);
    });

    it('parses with a valid UUID clientMutationId', () => {
      expect(schema.safeParse({ ...minimal, clientMutationId: VALID_UUID }).success).toBe(true);
      expect(schema.safeParse({ ...minimal, clientMutationId: ANOTHER_UUID }).success).toBe(true);
    });

    it('rejects a non-UUID clientMutationId', () => {
      expect(schema.safeParse({ ...minimal, clientMutationId: 'cmid_abcdefghij' }).success).toBe(
        false,
      );
      expect(schema.safeParse({ ...minimal, clientMutationId: '' }).success).toBe(false);
      expect(schema.safeParse({ ...minimal, clientMutationId: 'not-a-uuid' }).success).toBe(false);
    });
  });
}
