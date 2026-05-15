import { sql, type SQL } from 'drizzle-orm';

export type TiptapJSON = unknown;

export type MentionParseResult = {
  mentionedUserId: string;
  /** Matched username / label as it appeared in the comment body. */
  mentionText: string;
};

type Queryable = {
  execute(query: SQL): Promise<unknown>;
};

type UserRow = { id: string; name: string };

type MentionCandidate =
  | { kind: 'name'; key: string; mentionText: string }
  | { kind: 'id'; key: string; mentionText: string };

const USERNAME_MENTION_RE = /(?:^|\s)@([a-zA-Z0-9_.-]+)/g;

function rowsFrom(result: unknown): UserRow[] {
  if (Array.isArray(result)) return result as UserRow[];
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as UserRow[];
  }
  if (result && typeof (result as Iterable<UserRow>)[Symbol.iterator] === 'function') {
    return Array.from(result as Iterable<UserRow>);
  }
  return [];
}

function collectMentions(body: TiptapJSON): MentionCandidate[] {
  const candidates: MentionCandidate[] = [];
  const seenNames = new Set<string>();
  const seenIds = new Set<string>();
  let textBuffer = '';

  const addName = (mentionText: string) => {
    const key = mentionText.toLowerCase();
    if (seenNames.has(key)) return;
    seenNames.add(key);
    candidates.push({ kind: 'name', key, mentionText });
  };

  const addId = (id: string, label?: string) => {
    if (seenIds.has(id)) return;
    seenIds.add(id);
    candidates.push({ kind: 'id', key: id, mentionText: label?.trim() || id });
  };

  const flushText = () => {
    if (!textBuffer) return;
    for (const match of textBuffer.matchAll(USERNAME_MENTION_RE)) {
      const mentionText = match[1];
      if (mentionText) addName(mentionText);
    }
    textBuffer = '';
  };

  // Faz 6 review fix (K1/K3): depth cap + root-only JSON re-parse.
  // Recursion bombası riski: kötü niyetli bir yorum `text` node'una iç içe
  // JSON.stringify(self) yerleştirip sonsuz visit() zinciri tetikleyebilir.
  // Ayrıca yalnız kök body'nin string-encoded Tiptap JSON olması beklenir;
  // inner `text` node'ları kod örnekleri (`{ foo: 'bar' }`) içerebilir ve
  // bunlar yanlışlıkla JSON.parse'a sürüklenmemelidir.
  const MAX_DEPTH = 32;
  const visit = (node: unknown, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    if (typeof node === 'string') {
      // Sadece kök body (depth === 0) için JSON.parse fallback'i çalışır;
      // inner text node'ları (depth > 0) düz metin olarak buffer'a eklenir.
      if (depth === 0) {
        const trimmed = node.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            const parsed = JSON.parse(node) as unknown;
            if (parsed && typeof parsed === 'object') {
              visit(parsed, depth + 1);
              return;
            }
          } catch {
            // Not JSON after all; treat it as plain comment text below.
          }
        }
      }
      textBuffer += node;
      return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;

    if (record.type === 'text' && typeof record.text === 'string') {
      textBuffer += record.text;
    }
    if (record.type === 'mention' && record.attrs && typeof record.attrs === 'object') {
      flushText();
      const attrs = record.attrs as Record<string, unknown>;
      if (typeof attrs.id === 'string' && attrs.id.trim()) {
        addId(attrs.id, typeof attrs.label === 'string' ? attrs.label : undefined);
      }
    }

    if (Array.isArray(record.content)) {
      for (const child of record.content) visit(child, depth + 1);
    }
  };

  visit(body, 0);
  flushText();
  return candidates;
}

async function loadAccessibleUsers(
  db: Queryable,
  boardId: string,
  lowerNames: string[],
  userIds: string[],
): Promise<UserRow[]> {
  if (lowerNames.length === 0 && userIds.length === 0) return [];

  const nameFilter =
    lowerNames.length > 0
      ? sql`lower(u.name) in (${sql.join(
          lowerNames.map((name) => sql`${name}`),
          sql`, `,
        )})`
      : sql`false`;
  const idFilter =
    userIds.length > 0
      ? sql`u.id in (${sql.join(
          userIds.map((id) => sql`${id}`),
          sql`, `,
        )})`
      : sql`false`;

  const result = await db.execute(sql`
    SELECT u.id, u.name
    FROM users u
    WHERE (${nameFilter} OR ${idFilter})
      AND (
        EXISTS (
          SELECT 1
          FROM board_members bm
          WHERE bm.board_id = ${boardId}
            AND bm.user_id = u.id
        )
        OR EXISTS (
          SELECT 1
          FROM workspace_members wm
          JOIN boards b ON b.workspace_id = wm.workspace_id
          WHERE b.id = ${boardId}
            AND wm.user_id = u.id
            AND wm.role IN ('owner', 'admin', 'member')
        )
      )
  `);

  return rowsFrom(result);
}

export async function parseMentions(
  commentBody: TiptapJSON,
  boardId: string,
  ctx: { db: Queryable },
): Promise<MentionParseResult[]> {
  const candidates = collectMentions(commentBody);
  if (candidates.length === 0) return [];

  const lowerNames = candidates
    .filter((c): c is Extract<MentionCandidate, { kind: 'name' }> => c.kind === 'name')
    .map((c) => c.key);
  const userIds = candidates
    .filter((c): c is Extract<MentionCandidate, { kind: 'id' }> => c.kind === 'id')
    .map((c) => c.key);
  const rows = await loadAccessibleUsers(ctx.db, boardId, lowerNames, userIds);

  const byLowerName = new Map<string, UserRow>();
  const byId = new Map<string, UserRow>();
  for (const row of rows) {
    byId.set(row.id, row);
    byLowerName.set(row.name.toLowerCase(), row);
  }

  const seenUserIds = new Set<string>();
  const results: MentionParseResult[] = [];
  for (const candidate of candidates) {
    const row =
      candidate.kind === 'name' ? byLowerName.get(candidate.key) : byId.get(candidate.key);
    if (!row || seenUserIds.has(row.id)) continue;
    seenUserIds.add(row.id);
    results.push({ mentionedUserId: row.id, mentionText: candidate.mentionText });
  }
  return results;
}
