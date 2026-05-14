import { z } from 'zod';
import { SEARCH_ENTITY_TYPES } from '../constants';
import { idSchema } from './common';

export const searchEntityTypeSchema = z.enum(SEARCH_ENTITY_TYPES);

export const searchQueryInput = z.object({
  query: z.string().trim().min(2).max(200),
  workspaceId: idSchema.optional(),
  boardId: idSchema.optional(),
  entityTypes: z.array(searchEntityTypeSchema).min(1).max(SEARCH_ENTITY_TYPES.length).optional(),
  includeArchived: z.boolean().default(false),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

const searchLabelSchema = z.string().trim().min(1).max(50);

export const searchDocumentUpsertInput = z.object({
  workspaceId: idSchema,
  boardId: idSchema.nullable().optional(),
  cardId: idSchema.nullable().optional(),
  entityType: searchEntityTypeSchema,
  entityId: idSchema,
  title: z.string().trim().min(1).max(500),
  body: z.string().max(20_000).nullable().optional(),
  labels: z.array(searchLabelSchema).default([]),
  archivedAt: z.coerce.date().nullable().optional(),
  updatedAt: z.coerce.date().optional(),
});

export const searchDocumentDeleteInput = z.object({
  entityType: searchEntityTypeSchema,
  entityId: idSchema,
});

export const searchReindexScopeInput = z.object({
  workspaceId: idSchema.optional(),
  boardId: idSchema.optional(),
  entityTypes: z.array(searchEntityTypeSchema).min(1).max(SEARCH_ENTITY_TYPES.length).optional(),
  limit: z.number().int().min(1).max(5_000).default(500),
  cursor: z.string().optional(),
});

export const searchResultSchema = z.object({
  id: idSchema,
  entityType: searchEntityTypeSchema,
  entityId: idSchema,
  workspaceId: idSchema,
  workspaceTitle: z.string().min(1),
  boardId: idSchema.nullable().optional(),
  boardTitle: z.string().nullable().optional(),
  cardId: idSchema.nullable().optional(),
  cardTitle: z.string().nullable().optional(),
  title: z.string().min(1),
  snippet: z.string(),
  rank: z.number().nonnegative(),
  targetUrl: z.string().min(1),
  updatedAt: z.date(),
});

export type SearchEntityTypeInput = z.infer<typeof searchEntityTypeSchema>;
export type SearchQueryInput = z.infer<typeof searchQueryInput>;
export type SearchDocumentUpsertInput = z.infer<typeof searchDocumentUpsertInput>;
export type SearchDocumentDeleteInput = z.infer<typeof searchDocumentDeleteInput>;
export type SearchReindexScopeInput = z.infer<typeof searchReindexScopeInput>;
export type SearchResult = z.infer<typeof searchResultSchema>;
