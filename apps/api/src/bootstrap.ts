import { randomBytes } from 'node:crypto';
import {
  activityEvents,
  boardMembers,
  boards,
  cardLabels,
  cardMembers,
  cards,
  checklistItems,
  checklists,
  comments,
  type Database,
  getDb,
  labels,
  lists,
  upsertSearchDocument,
  workspaceMembers,
  workspaces,
} from '@pusula/db';

/** Drizzle transaction handle, as exposed inside `db.transaction(async (tx) => …)`. */
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
import {
  ONBOARDING_BOARD_BACKGROUND,
  ONBOARDING_BOARD_TITLE,
  ONBOARDING_CARDS,
  ONBOARDING_LABELS,
  ONBOARDING_LISTS,
  ONBOARDING_WORKSPACE_NAME,
  type OnboardingLabelKey,
  type OnboardingListKey,
  positionBetween,
} from '@pusula/domain';

/**
 * Best-effort onboarding bootstrap, invoked from Better Auth's
 * `databaseHooks.user.create.after` (see `apps/api/src/auth.ts`). For a brand-new
 * user we create — in one transaction — a default workspace (the user as `owner`),
 * then call {@link seedShowcaseBoard} to drop an "İlk Pano" carrying the showcase
 * template (Trello-style gradient background, board-scope label palette, mixed
 * coloured/default lists, and cards that each both explain and visualise one
 * product feature). The template content lives in `@pusula/domain` constants.
 * See `docs/domain/01-urun-modeli.md` (invariant 11) and
 * `docs/architecture/08-web-ve-mobil.md` (§8.1.3).
 *
 * The caller must treat this as best-effort: on failure, log and carry on —
 * signup must still succeed. The transaction is atomic, so a failure leaves
 * nothing behind; `workspace.list` is then allowed to come back empty and the web
 * app shows the onboarding empty state where the user can create a workspace
 * themselves.
 *
 * Realtime is *not* published from here: `boards.version` stays at its initial
 * value (`0`); no client is watching yet, and the board enters the world in its
 * showcase shape.
 */
export async function bootstrapNewUser(userId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(workspaces)
      .values({ name: ONBOARDING_WORKSPACE_NAME, slug: onboardingWorkspaceSlug(), ownerId: userId })
      .returning({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug });
    if (!workspace) throw new Error('onboarding bootstrap: workspace insert returned no row');

    await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId, role: 'owner' });

    await tx.insert(activityEvents).values({
      workspaceId: workspace.id,
      actorId: userId,
      type: 'workspace.created',
      payload: { name: workspace.name, slug: workspace.slug, onboarding: true },
    });

    await seedShowcaseBoard(tx, { workspaceId: workspace.id, actorId: userId });
  });
}

/**
 * Insert the onboarding showcase board into an *existing* workspace. Used by:
 *  - {@link bootstrapNewUser} during signup (in the same transaction).
 *  - One-shot re-seed scripts (`apps/api/src/scripts/reseed-onboarding.ts`) that
 *    delete an old onboarding board and lay a fresh showcase down in its place.
 *
 * The caller owns the transaction and is responsible for any prior cleanup
 * (deleting an existing board); this helper only **inserts**. Same rules apply
 * as for the new-user bootstrap: `boards.version` stays at `0`, no realtime
 * publish, every activity event carries `onboarding: true`, and every entity
 * (board/list/card/comment/label) is upserted into `search_documents` so the
 * showcase is searchable on first login.
 *
 * Returns the new board's id so callers can reference it.
 */
export async function seedShowcaseBoard(
  tx: Tx,
  { workspaceId, actorId }: { workspaceId: string; actorId: string },
): Promise<{ boardId: string }> {
  const now = new Date();

  // --- Board with showcase background + creator membership + activity. ---
  const [board] = await tx
    .insert(boards)
    .values({
      workspaceId,
      title: ONBOARDING_BOARD_TITLE,
      background: ONBOARDING_BOARD_BACKGROUND,
    })
    .returning({ id: boards.id, title: boards.title });
  if (!board) throw new Error('onboarding bootstrap: board insert returned no row');

  await tx
    .insert(boardMembers)
    .values({ boardId: board.id, userId: actorId, role: 'admin' });

  await tx.insert(activityEvents).values([
    {
      workspaceId,
      boardId: board.id,
      actorId,
      type: 'board.created',
      payload: { title: board.title, onboarding: true },
    },
    {
      workspaceId,
      boardId: board.id,
      actorId,
      type: 'board.background_changed',
      payload: { background: ONBOARDING_BOARD_BACKGROUND, onboarding: true },
    },
  ]);

  await upsertSearchDocument(tx, { entityType: 'board', entityId: board.id });

  // --- Board-scope label palette (referenced by card_labels below). ---
  const labelIdByKey = {} as Record<OnboardingLabelKey, string>;
  for (const palette of ONBOARDING_LABELS) {
    const [row] = await tx
      .insert(labels)
      .values({ boardId: board.id, name: palette.name, color: palette.color })
      .returning({ id: labels.id });
    if (!row) throw new Error(`onboarding bootstrap: label insert returned no row (${palette.key})`);
    labelIdByKey[palette.key] = row.id;
    await upsertSearchDocument(tx, { entityType: 'label', entityId: row.id });
  }

  // --- Lists: some columns are pre-styled, others ship in the default look so
  //     the user sees both side by side. Only emit colour/icon activity when the
  //     value is actually set (a null→null "change" is not an activity).
  const listIdByKey = {} as Record<OnboardingListKey, string>;
  let listCursor: string | null = null;
  for (const spec of ONBOARDING_LISTS) {
    listCursor = positionBetween(listCursor, null);
    const [row] = await tx
      .insert(lists)
      .values({
        boardId: board.id,
        title: spec.title,
        color: spec.color,
        icon: spec.icon,
        iconColor: spec.iconColor,
        position: listCursor,
      })
      .returning({ id: lists.id, title: lists.title });
    if (!row) throw new Error(`onboarding bootstrap: list insert returned no row (${spec.key})`);
    listIdByKey[spec.key] = row.id;

    const listActivities: (typeof activityEvents.$inferInsert)[] = [
      {
        workspaceId,
        boardId: board.id,
        actorId,
        type: 'list.created',
        payload: { listId: row.id, title: spec.title, position: listCursor, onboarding: true },
      },
    ];
    if (spec.color !== null) {
      listActivities.push({
        workspaceId,
        boardId: board.id,
        actorId,
        type: 'list.color_changed',
        payload: { listId: row.id, color: spec.color, onboarding: true },
      });
    }
    if (spec.icon !== null) {
      listActivities.push({
        workspaceId,
        boardId: board.id,
        actorId,
        type: 'list.icon_changed',
        payload: { listId: row.id, icon: spec.icon, iconColor: spec.iconColor, onboarding: true },
      });
    }
    await tx.insert(activityEvents).values(listActivities);

    await upsertSearchDocument(tx, { entityType: 'list', entityId: row.id });
  }

  // --- Cards: each entry carries optional cover/due/labels/members/checklists/comments. ---
  const cardCursorByList: Partial<Record<string, string | null>> = {};
  for (const card of ONBOARDING_CARDS) {
    const listId = listIdByKey[card.listKey];
    const previousCursor = cardCursorByList[listId] ?? null;
    const cardCursor = positionBetween(previousCursor, null);
    cardCursorByList[listId] = cardCursor;

    const dueAt =
      card.dueAtOffsetDays === undefined
        ? null
        : new Date(now.getTime() + card.dueAtOffsetDays * 86_400_000);

    const [cardRow] = await tx
      .insert(cards)
      .values({
        boardId: board.id,
        listId,
        title: card.title,
        description: card.description ?? null,
        coverColor: card.coverColor ?? null,
        position: cardCursor,
        dueAt,
        completed: card.completed ?? false,
        completedAt: card.completed ? now : null,
        completedBy: card.completed ? actorId : null,
      })
      .returning({ id: cards.id });
    if (!cardRow) {
      throw new Error(`onboarding bootstrap: card insert returned no row (${card.title})`);
    }

    const cardActivities: (typeof activityEvents.$inferInsert)[] = [
      {
        workspaceId,
        boardId: board.id,
        cardId: cardRow.id,
        actorId,
        type: 'card.created',
        payload: {
          cardId: cardRow.id,
          listId,
          title: card.title,
          position: cardCursor,
          onboarding: true,
        },
      },
    ];

    if (card.coverColor) {
      cardActivities.push({
        workspaceId,
        boardId: board.id,
        cardId: cardRow.id,
        actorId,
        type: 'card.cover_changed',
        payload: { cardId: cardRow.id, coverColor: card.coverColor, onboarding: true },
      });
    }
    if (dueAt) {
      cardActivities.push({
        workspaceId,
        boardId: board.id,
        cardId: cardRow.id,
        actorId,
        type: 'card.due_set',
        payload: { cardId: cardRow.id, dueAt: dueAt.toISOString(), onboarding: true },
      });
    }
    if (card.completed) {
      cardActivities.push({
        workspaceId,
        boardId: board.id,
        cardId: cardRow.id,
        actorId,
        type: 'card.completed',
        payload: { cardId: cardRow.id, onboarding: true },
      });
    }

    if (card.labelKeys && card.labelKeys.length > 0) {
      await tx
        .insert(cardLabels)
        .values(card.labelKeys.map((k) => ({ cardId: cardRow.id, labelId: labelIdByKey[k] })));
      for (const k of card.labelKeys) {
        cardActivities.push({
          workspaceId,
          boardId: board.id,
          cardId: cardRow.id,
          actorId,
          type: 'card.label_added',
          payload: { cardId: cardRow.id, labelId: labelIdByKey[k], onboarding: true },
        });
      }
    }

    if (card.members && card.members.length > 0) {
      await tx
        .insert(cardMembers)
        .values(card.members.map((m) => ({ cardId: cardRow.id, userId: actorId, role: m.role })));
      for (const m of card.members) {
        cardActivities.push({
          workspaceId,
          boardId: board.id,
          cardId: cardRow.id,
          actorId,
          type: 'card.member_added',
          payload: { cardId: cardRow.id, userId: actorId, role: m.role, onboarding: true },
        });
      }
    }

    await tx.insert(activityEvents).values(cardActivities);

    if (card.checklists) {
      let checklistCursor: string | null = null;
      for (const checklist of card.checklists) {
        checklistCursor = positionBetween(checklistCursor, null);
        const [checklistRow] = await tx
          .insert(checklists)
          .values({ cardId: cardRow.id, title: checklist.title, position: checklistCursor })
          .returning({ id: checklists.id });
        if (!checklistRow) {
          throw new Error('onboarding bootstrap: checklist insert returned no row');
        }

        await tx.insert(activityEvents).values({
          workspaceId,
          boardId: board.id,
          cardId: cardRow.id,
          actorId,
          type: 'checklist.created',
          payload: {
            checklistId: checklistRow.id,
            cardId: cardRow.id,
            title: checklist.title,
            onboarding: true,
          },
        });

        let itemCursor: string | null = null;
        for (const item of checklist.items) {
          itemCursor = positionBetween(itemCursor, null);
          const [itemRow] = await tx
            .insert(checklistItems)
            .values({
              checklistId: checklistRow.id,
              content: item.content,
              position: itemCursor,
              completed: item.completed,
              completedAt: item.completed ? now : null,
              completedBy: item.completed ? actorId : null,
            })
            .returning({ id: checklistItems.id });
          if (!itemRow) {
            throw new Error('onboarding bootstrap: checklist item insert returned no row');
          }

          await tx.insert(activityEvents).values({
            workspaceId,
            boardId: board.id,
            cardId: cardRow.id,
            actorId,
            type: 'checklist.item_added',
            payload: {
              itemId: itemRow.id,
              checklistId: checklistRow.id,
              content: item.content,
              onboarding: true,
            },
          });
          if (item.completed) {
            await tx.insert(activityEvents).values({
              workspaceId,
              boardId: board.id,
              cardId: cardRow.id,
              actorId,
              type: 'checklist.item_checked',
              payload: { itemId: itemRow.id, checklistId: checklistRow.id, onboarding: true },
            });
          }
        }
      }
    }

    if (card.comments) {
      for (const cm of card.comments) {
        const [commentRow] = await tx
          .insert(comments)
          .values({ cardId: cardRow.id, authorId: actorId, body: cm.body })
          .returning({ id: comments.id });
        if (!commentRow) {
          throw new Error('onboarding bootstrap: comment insert returned no row');
        }

        await tx.insert(activityEvents).values({
          workspaceId,
          boardId: board.id,
          cardId: cardRow.id,
          actorId,
          type: 'comment.created',
          payload: { commentId: commentRow.id, cardId: cardRow.id, onboarding: true },
        });

        await upsertSearchDocument(tx, { entityType: 'comment', entityId: commentRow.id });
      }
    }

    await upsertSearchDocument(tx, { entityType: 'card', entityId: cardRow.id });
  }

  return { boardId: board.id };
}

/**
 * Slug for the onboarding workspace: an ASCII-folded base of `ONBOARDING_WORKSPACE_NAME`
 * plus a long random suffix so it's globally unique (the `workspaces_slug_uq` index is
 * on `slug`; a collision would abort the bootstrap, which the best-effort hook then just
 * logs). The base is a fixed transliteration — the slug is opaque, so it doesn't need to
 * track the display name exactly.
 */
function onboardingWorkspaceSlug(): string {
  return `calisma-alanim-${randomBytes(8).toString('hex')}`;
}
