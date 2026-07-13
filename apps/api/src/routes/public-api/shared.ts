/**
 * Public API + Bot Erişimi (Task 4) — REST handler ortak yardımcıları.
 *
 * Handler'lar iş mantığı yazmaz; yalnız adapter'dır:
 *   idempotency doğrula → key scope doğrula → path/body'yi tRPC input'una map'le
 *   → bot caller çağır → `serializeForPublicApi` (başarı) veya `mapTrpcError`
 *   (hata) → JSON.
 *
 * Scope disiplini (plan "Scope kontrolü"):
 *  - boardId taşıyan input'larda `key.boardId` kullanılır (board/list create,
 *    `board.get` vb.).
 *  - `:cardId` / `:listId` path'li uçlarda kaynağın board'u hafif bir select ile
 *    çözülür; kaynak yoksa 404, `key.boardId` ile eşleşmiyorsa 403 (procedure'ün
 *    kendi membership kontrolü buna EK savunmadır).
 *  - `move` / `move-to-list` / `copy` hedef listesinin board'u da `key.boardId`
 *    şartına bağlanır (çapraz board sızıntısı → 403).
 *
 * Bkz. `docs/superpowers/plans/2026-07-13-public-api-ve-bot-erisimi.md` Task 4.
 */
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import * as Sentry from '@sentry/node';
import { attachments, cards, eq, getDb, lists } from '@pusula/db';
import { plainTextToTiptap } from '@pusula/domain';
import type { ApiKeyAuthEnv } from '../../middleware/api-key-auth';
import { createPublicApiCaller, type PublicApiCaller } from '../../public-api/caller';
import { mapTrpcError } from '../../public-api/errors';
import { IDEMPOTENCY_HEADER, parseIdempotencyKey } from '../../public-api/idempotency';
import { serializeForPublicApi } from '../../public-api/serialize';

/** Hono request context, narrowed to the `apiKeyAuth` variable shape. */
export type PublicApiContext = Context<ApiKeyAuthEnv>;

/** The board this API key is locked to (scope root). */
export function keyBoardId(c: PublicApiContext): string {
  return c.get('apiKeyAuth').apiKey.boardId;
}

/** Build a bot-identity tRPC caller for the current request. */
export function callerFor(c: PublicApiContext): PublicApiCaller {
  const { apiKey, botUser } = c.get('apiKeyAuth');
  return createPublicApiCaller({ botUser, apiKeyId: apiKey.id, c });
}

/**
 * Run a caller operation and translate the outcome to a public-API JSON
 * response: success → `serializeForPublicApi` (Date→ISO); `TRPCError` →
 * `mapTrpcError` (status + body); 5xx → Sentry.
 */
export async function respond<T>(
  c: PublicApiContext,
  run: (caller: PublicApiCaller) => Promise<T>,
  successStatus: ContentfulStatusCode = 200,
): Promise<Response> {
  try {
    const result = await run(callerFor(c));
    // `serializeForPublicApi` yields a JSON-safe tree; `as never` satisfies
    // Hono's `json<T extends JSONValue>` generic without a false `any`.
    return c.json(serializeForPublicApi(result) as never, successStatus);
  } catch (err) {
    const mapped = mapTrpcError(err);
    if (mapped.report) {
      Sentry.captureException(err, { tags: { area: 'public-api' } });
    }
    return c.json(mapped.body as never, mapped.status as ContentfulStatusCode);
  }
}

/** Idempotency parse result: the validated UUID, or a ready-to-return 400. */
export type IdempotencyResult = { ok: true; key: string } | { ok: false; res: Response };

/**
 * Every mutation endpoint requires a valid `Idempotency-Key` (UUID). Missing or
 * non-UUID → 400 (before any caller runs).
 */
export function requireIdempotencyKey(c: PublicApiContext): IdempotencyResult {
  const parsed = parseIdempotencyKey(c.req.header(IDEMPOTENCY_HEADER));
  if (!parsed.ok) {
    return { ok: false, res: c.json({ error: parsed.error }, 400) };
  }
  return { ok: true, key: parsed.key! };
}

/** Scope check result: allowed, or a ready-to-return 403/404. */
export type ScopeResult = { ok: true } | { ok: false; res: Response };

async function resolveCardBoardId(cardId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ boardId: cards.boardId })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);
  return row?.boardId ?? null;
}

async function resolveListBoardId(listId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ boardId: lists.boardId })
    .from(lists)
    .where(eq(lists.id, listId))
    .limit(1);
  return row?.boardId ?? null;
}

/**
 * The `:cardId` on the path must belong to this key's board. Card missing → 404;
 * card in another board → 403. Defense-in-depth on top of the procedure's own
 * membership resolution.
 */
export async function requireCardInBoard(c: PublicApiContext, cardId: string): Promise<ScopeResult> {
  const boardId = await resolveCardBoardId(cardId);
  if (boardId === null) {
    return { ok: false, res: c.json({ error: { code: 'NOT_FOUND', message: 'Kart bulunamadı.' } }, 404) };
  }
  if (boardId !== keyBoardId(c)) {
    return {
      ok: false,
      res: c.json({ error: { code: 'FORBIDDEN', message: 'Bu kart panonuza ait değil.' } }, 403),
    };
  }
  return { ok: true };
}

async function resolveAttachmentBoardId(attachmentId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ boardId: attachments.boardId })
    .from(attachments)
    .where(eq(attachments.id, attachmentId))
    .limit(1);
  return row?.boardId ?? null;
}

/**
 * An attachment (`:attachmentId` path, or a `commit` body `attachmentId`) must
 * belong to this key's board. Missing → 404; cross-board → 403. Defense-in-depth
 * on top of the `attachment.*` procedures' own board-access resolution (they
 * resolve the board from the attachment row's `board_id`, so a foreign-board
 * attachment already fails there — this yields a clean 404/403 first).
 */
export async function requireAttachmentInBoard(
  c: PublicApiContext,
  attachmentId: string,
): Promise<ScopeResult> {
  const boardId = await resolveAttachmentBoardId(attachmentId);
  if (boardId === null) {
    return { ok: false, res: c.json({ error: { code: 'NOT_FOUND', message: 'Ek bulunamadı.' } }, 404) };
  }
  if (boardId !== keyBoardId(c)) {
    return {
      ok: false,
      res: c.json({ error: { code: 'FORBIDDEN', message: 'Bu ek panonuza ait değil.' } }, 403),
    };
  }
  return { ok: true };
}

/**
 * A list (`:listId` path, or a `move`/`copy` target `toListId`) must belong to
 * this key's board. Missing → 404; cross-board → 403.
 */
export async function requireListInBoard(
  c: PublicApiContext,
  listId: string,
  notFoundMessage = 'Liste bulunamadı.',
  forbiddenMessage = 'Bu liste panonuza ait değil.',
): Promise<ScopeResult> {
  const boardId = await resolveListBoardId(listId);
  if (boardId === null) {
    return { ok: false, res: c.json({ error: { code: 'NOT_FOUND', message: notFoundMessage } }, 404) };
  }
  if (boardId !== keyBoardId(c)) {
    return { ok: false, res: c.json({ error: { code: 'FORBIDDEN', message: forbiddenMessage } }, 403) };
  }
  return { ok: true };
}

/** Parse a JSON request body; a missing / malformed / non-object body → `{}`. */
export async function readBody(c: PublicApiContext): Promise<Record<string, unknown>> {
  const raw = await c.req.json().catch(() => null);
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/**
 * Copy only the keys the client actually sent (`key in body`) onto a caller
 * input — so `card.update`'s `'field' in input` presence semantics (e.g.
 * `dueAt: null` = clear) survive the REST hop. `undefined`-valued keys and
 * unlisted keys are dropped.
 */
export function pickPresent(
  body: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in body) out[key] = body[key];
  }
  return out;
}

/**
 * Normalize a REST rich-text field (comment body / checklist item content) to
 * the canonical **string** the procedures store (`z.string()` columns holding
 * either legacy plain text or `JSON.stringify(tiptapDoc)`, the exact shape the
 * web editor persists). A bot may send either:
 *  - a plain **string** → wrapped into a minimal Tiptap doc (`plainTextToTiptap`)
 *    and serialized (each `\n` → a paragraph);
 *  - a Tiptap JSON **object** → serialized as-is (structured content passthrough).
 * Both consumers (`richTextPreview`, `parseRichTextValue`) parse the result.
 * A non-string / non-object value is returned untouched so the procedure's Zod
 * schema rejects it (400) rather than the adapter guessing.
 */
export function richTextInputToString(value: unknown): unknown {
  if (typeof value === 'string') {
    return JSON.stringify(plainTextToTiptap(value));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return value;
}
