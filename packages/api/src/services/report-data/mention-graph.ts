/**
 * `mention-graph` micro-report — yorum mention parse (V1 basit regex
 * comments.body içinde @username arar). Scope: B/W. Tablo "Mention eden →
 * Mention edilen → sayı" + top 30.
 *
 * NOT: V1 minimum viable — comment body düz metin / Tiptap text node'ları
 * birleştirilmiş hâl varsayılır. Daha sofistike Tiptap JSON `mention` node
 * parse'ı 13Q sonrası iyileştirilebilir.
 */
import { inArray, isNotNull, sql } from '@pusula/db';
import { cards, comments, users } from '@pusula/db';
import type { ScopeAdapter } from '@pusula/domain/reports';
import { asDb, cardIdsInBoard } from './helpers';

export interface MentionEdge {
  authorId: string;
  authorName: string | null;
  mentionedId: string;
  mentionedName: string | null;
  count: number;
}

export interface MentionGraphData {
  edges: MentionEdge[];
}

/** Body içinde @username token'larını topla. */
function extractMentionTokens(body: string): string[] {
  if (!body) return [];
  const matches = body.match(/@([A-Za-z0-9_.-]{2,40})/g);
  return matches ? matches.map((m) => m.slice(1).toLowerCase()) : [];
}

async function aggregate(
  ctx: Parameters<NonNullable<ScopeAdapter<MentionGraphData>['board']>>[0],
  cardIds: string[],
): Promise<MentionGraphData> {
  if (cardIds.length === 0) return { edges: [] };
  const db = asDb(ctx);
  const rows = await db
    .select({
      authorId: comments.authorId,
      body: comments.body,
    })
    .from(comments)
    .where(sql`${comments.cardId} IN (${sql.join(cardIds.map((id) => sql`${id}`), sql`, `)}) AND ${comments.authorId} IS NOT NULL`);
  if (rows.length === 0) return { edges: [] };
  // Tüm potansiyel mention token'ları topla.
  const tokenSet = new Set<string>();
  const parsedRows = rows.map((r) => {
    const tokens = extractMentionTokens(r.body ?? '');
    for (const t of tokens) tokenSet.add(t);
    return { authorId: r.authorId as string, tokens };
  });
  if (tokenSet.size === 0) return { edges: [] };
  // Token → user.id resolve: users.name lower-case eşleşmesi (V1 basit).
  const allUsers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(isNotNull(users.name));
  const nameToId = new Map<string, { id: string; name: string }>();
  for (const u of allUsers) {
    if (!u.name) continue;
    const key = u.name.toLowerCase().replace(/\s+/g, '');
    nameToId.set(key, { id: u.id, name: u.name });
  }
  // Authors için de id→name map.
  const idToName = new Map<string, string | null>();
  for (const u of allUsers) idToName.set(u.id, u.name ?? null);
  // (authorId → mentionedId) → count
  const counter = new Map<string, number>();
  for (const r of parsedRows) {
    for (const tok of r.tokens) {
      const resolved = nameToId.get(tok);
      if (!resolved) continue;
      if (resolved.id === r.authorId) continue; // self-mention atla
      const key = `${r.authorId}|${resolved.id}`;
      counter.set(key, (counter.get(key) ?? 0) + 1);
    }
  }
  if (counter.size === 0) return { edges: [] };
  const edges: MentionEdge[] = Array.from(counter.entries())
    .map(([key, count]) => {
      const [authorId, mentionedId] = key.split('|') as [string, string];
      return {
        authorId,
        authorName: idToName.get(authorId) ?? null,
        mentionedId,
        mentionedName: idToName.get(mentionedId) ?? null,
        count,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
  return { edges };
}

export const mentionGraphAdapter: ScopeAdapter<MentionGraphData> = {
  async board(ctx, scope) {
    const cardIds = await cardIdsInBoard(ctx, scope.boardId);
    return aggregate(ctx, cardIds);
  },
  async workspace(ctx, scope) {
    const accessibleBoardIds = await ctx.permissions.accessibleBoardsInWorkspace(
      scope.workspaceId,
    );
    if (accessibleBoardIds.length === 0) return { edges: [] };
    const db = asDb(ctx);
    const listRows = await db
      .select({ id: sql<string>`l.id` })
      .from(sql`lists l`)
      .where(sql`l.board_id IN (${sql.join(accessibleBoardIds.map((id) => sql`${id}`), sql`, `)})`);
    if (listRows.length === 0) return { edges: [] };
    const cardRows = await db.select({ id: cards.id }).from(cards).where(inArray(cards.listId, listRows.map((r) => r.id)));
    return aggregate(ctx, cardRows.map((r) => r.id));
  },
};
