/**
 * Public API + Bot Erişimi (Task 4) — board okuma uçları.
 *
 *   GET /board            → board.get            (boardId = key.boardId)
 *   GET /board/activity   → board.activity.list  (query → input map'i)
 *   GET /board/members    → board.members.list
 *
 * Board path parametresi YOK: key tek panoya kilitli olduğundan hedef board her
 * zaman `key.boardId`'dir (plan Task 4 §1).
 */
import { Hono } from 'hono';
import type { ApiKeyAuthEnv } from '../../middleware/api-key-auth';
import { keyBoardId, respond } from './shared';

export const boardPublicRoute = new Hono<ApiKeyAuthEnv>();

// GET /board — board shell + lists + active cards.
boardPublicRoute.get('/', (c) => respond(c, (caller) => caller.board.get({ boardId: keyBoardId(c) })));

// GET /board/activity — cursor-paginated board activity feed.
boardPublicRoute.get('/activity', (c) => {
  const limitRaw = c.req.query('limit');
  const cursor = c.req.query('cursor');
  const type = c.req.query('type');
  return respond(c, (caller) =>
    caller.board.activity.list({
      boardId: keyBoardId(c),
      ...(limitRaw !== undefined ? { limit: Number(limitRaw) } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
      // `type` is validated by the procedure's Zod input (activity event enum);
      // an unknown value → BAD_REQUEST 400.
      ...(type !== undefined ? { type: type as never } : {}),
    }),
  );
});

// GET /board/members — board members (explicit + inherited admins).
//
// The underlying `board.members.list` procedure returns each member's account
// `email` for the trusted web board-settings UI (DEM-157). A bot has no need for
// human e-mail addresses, so the adapter strips `email` (PII minimization — M1):
// `userId`/`name`/`image`/`role`/`isBot`/`inherited` are enough to reconcile
// members. The strip lives here (not in the procedure) so the web caller is
// unaffected.
boardPublicRoute.get('/members', (c) =>
  respond(c, async (caller) => {
    const members = await caller.board.members.list({ boardId: keyBoardId(c) });
    return members.map(({ userId, role, name, image, isBot, inherited }) => ({
      userId,
      role,
      name,
      image,
      isBot,
      inherited,
    }));
  }),
);
