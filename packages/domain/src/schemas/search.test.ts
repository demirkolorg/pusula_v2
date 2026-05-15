import { describe, expect, it } from 'vitest';
import { SEARCH_ENTITY_TYPES } from '../constants';
import * as schemas from './index';

describe('SEARCH_ENTITY_TYPES', () => {
  it('matches the Faz 6.5 indexed entity set', () => {
    expect(SEARCH_ENTITY_TYPES).toEqual(['board', 'list', 'card', 'comment', 'label']);
  });
});

describe('search.query input contract', () => {
  it('accepts the first Faz 6.5 query scope and trims the query', () => {
    const searchQueryInput = schemas.searchQueryInput;

    expect(
      searchQueryInput.parse({
        query: '  kart etiketi  ',
        workspaceId: 'ws_1',
        boardId: 'board_1',
        entityTypes: ['list', 'card'],
        includeArchived: true,
        limit: 50,
        cursor: 'next_1',
      }),
    ).toEqual({
      query: 'kart etiketi',
      workspaceId: 'ws_1',
      boardId: 'board_1',
      entityTypes: ['list', 'card'],
      includeArchived: true,
      limit: 50,
      cursor: 'next_1',
    });
  });

  it('rejects short queries, invalid entity types and oversized limits', () => {
    const searchQueryInput = schemas.searchQueryInput;

    expect(searchQueryInput.safeParse({ query: 'a' }).success).toBe(false);
    expect(searchQueryInput.safeParse({ query: 'kart', entityTypes: ['workspace'] }).success).toBe(
      false,
    );
    expect(searchQueryInput.safeParse({ query: 'kart', limit: 51 }).success).toBe(false);
  });
});

describe('search index helper contracts', () => {
  it('accepts a board-scoped search document with optional card context', () => {
    const searchDocumentUpsertInput = schemas.searchDocumentUpsertInput;

    expect(
      searchDocumentUpsertInput.parse({
        workspaceId: 'ws_1',
        boardId: 'board_1',
        cardId: 'card_1',
        entityType: 'comment',
        entityId: 'comment_1',
        title: '  Yorum  ',
        body: null,
        labels: ['bug', 'urgent'],
        archivedAt: null,
      }),
    ).toEqual({
      workspaceId: 'ws_1',
      boardId: 'board_1',
      cardId: 'card_1',
      entityType: 'comment',
      entityId: 'comment_1',
      title: 'Yorum',
      body: null,
      labels: ['bug', 'urgent'],
      archivedAt: null,
    });
  });

  it('rejects empty titles and invalid label tokens', () => {
    const searchDocumentUpsertInput = schemas.searchDocumentUpsertInput;

    expect(
      searchDocumentUpsertInput.safeParse({
        workspaceId: 'ws_1',
        boardId: 'board_1',
        entityType: 'card',
        entityId: 'card_1',
        title: '   ',
        labels: [],
      }).success,
    ).toBe(false);

    expect(
      searchDocumentUpsertInput.safeParse({
        workspaceId: 'ws_1',
        boardId: 'board_1',
        entityType: 'card',
        entityId: 'card_1',
        title: 'Kart',
        labels: [''],
      }).success,
    ).toBe(false);
  });
});

describe('search result contract', () => {
  it('parses the backend result shape consumed by web search', () => {
    const searchResultSchema = schemas.searchResultSchema;
    const updatedAt = new Date('2026-05-14T12:00:00.000Z');

    expect(
      searchResultSchema.parse({
        id: 'search_1',
        entityType: 'card',
        entityId: 'card_1',
        workspaceId: 'ws_1',
        workspaceTitle: 'Pusula',
        boardId: 'board_1',
        boardTitle: 'Roadmap',
        cardId: 'card_1',
        cardTitle: 'Arama',
        title: 'Arama',
        snippet: 'PostgreSQL FTS arama sonucu',
        rank: 0.75,
        targetUrl: '/workspaces/ws_1/boards/board_1?card=card_1',
        updatedAt,
      }),
    ).toEqual({
      id: 'search_1',
      entityType: 'card',
      entityId: 'card_1',
      workspaceId: 'ws_1',
      workspaceTitle: 'Pusula',
      boardId: 'board_1',
      boardTitle: 'Roadmap',
      cardId: 'card_1',
      cardTitle: 'Arama',
      title: 'Arama',
      snippet: 'PostgreSQL FTS arama sonucu',
      rank: 0.75,
      targetUrl: '/workspaces/ws_1/boards/board_1?card=card_1',
      updatedAt,
    });
  });
});
