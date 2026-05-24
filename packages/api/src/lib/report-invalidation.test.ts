import { describe, expect, it } from 'vitest';
import { collectInvalidationPatterns } from './report-invalidation';

describe('collectInvalidationPatterns', () => {
  it('workspace-only event → just the workspace pattern', () => {
    const out = collectInvalidationPatterns({
      eventType: 'workspace.member.added',
      workspaceId: 'w-1',
    });
    expect(out.patterns).toEqual(['report:dataset:v1:workspace:w-1:*']);
    expect(out.scopeKinds).toEqual(['workspace']);
  });

  it('card.created → all 4 scope kinds (card+list+board+workspace)', () => {
    const out = collectInvalidationPatterns({
      eventType: 'card.created',
      workspaceId: 'w-1',
      boardId: 'b-1',
      listId: 'l-1',
      cardId: 'c-1',
    });
    expect(out.patterns).toEqual(
      expect.arrayContaining([
        'report:dataset:v1:workspace:w-1:*',
        'report:dataset:v1:board:b-1:*',
        'report:dataset:v1:list:l-1:*',
        'report:dataset:v1:card:c-1:*',
      ]),
    );
    expect(new Set(out.scopeKinds)).toEqual(new Set(['workspace', 'board', 'list', 'card']));
  });

  it('cross-list card.moved → list + fromList both invalidated', () => {
    const out = collectInvalidationPatterns({
      eventType: 'card.moved',
      workspaceId: 'w-1',
      boardId: 'b-1',
      listId: 'l-target',
      fromListId: 'l-source',
      cardId: 'c-1',
    });
    expect(out.patterns).toEqual(
      expect.arrayContaining([
        'report:dataset:v1:list:l-target:*',
        'report:dataset:v1:list:l-source:*',
      ]),
    );
  });

  it('cross-board card.movedToList → both board patterns', () => {
    const out = collectInvalidationPatterns({
      eventType: 'card.movedToList',
      workspaceId: 'w-1',
      boardId: 'b-target',
      fromBoardId: 'b-source',
      listId: 'l-1',
      cardId: 'c-1',
    });
    expect(out.patterns).toEqual(
      expect.arrayContaining([
        'report:dataset:v1:board:b-target:*',
        'report:dataset:v1:board:b-source:*',
      ]),
    );
  });

  it('comment.created (card-bağlamlı) → 4 scope kind invalidate', () => {
    const out = collectInvalidationPatterns({
      eventType: 'comment.created',
      workspaceId: 'w-1',
      boardId: 'b-1',
      listId: 'l-1',
      cardId: 'c-1',
    });
    expect(out.patterns.length).toBe(4);
    expect(new Set(out.scopeKinds)).toEqual(new Set(['workspace', 'board', 'list', 'card']));
  });

  it('duplicate ids deduplicated (fromList === list edge)', () => {
    const out = collectInvalidationPatterns({
      eventType: 'card.updated',
      workspaceId: 'w-1',
      boardId: 'b-1',
      listId: 'l-1',
      fromListId: 'l-1', // same as listId
      cardId: 'c-1',
    });
    const listPatterns = out.patterns.filter((p) => p.includes(':list:'));
    expect(listPatterns.length).toBe(1);
  });

  it('null/undefined optionals safely skipped', () => {
    const out = collectInvalidationPatterns({
      eventType: 'workspace.archived',
      workspaceId: 'w-1',
      boardId: null,
      listId: undefined,
      cardId: null,
    });
    expect(out.patterns).toEqual(['report:dataset:v1:workspace:w-1:*']);
    expect(out.scopeKinds).toEqual(['workspace']);
  });

  it('scopeKinds order is deterministic (Set insertion)', () => {
    const out = collectInvalidationPatterns({
      eventType: 'card.created',
      workspaceId: 'w-1',
      boardId: 'b-1',
      listId: 'l-1',
      cardId: 'c-1',
    });
    expect(out.scopeKinds).toEqual(['workspace', 'board', 'list', 'card']);
  });
});
