import { randomBytes } from 'node:crypto';
import {
  activityEvents,
  boardMembers,
  boards,
  cards,
  getDb,
  lists,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import {
  ONBOARDING_BOARD_TITLE,
  ONBOARDING_LIST_TITLES,
  ONBOARDING_WELCOME_CARDS,
  ONBOARDING_WORKSPACE_NAME,
  positionBetween,
} from '@pusula/domain';

/**
 * Best-effort onboarding bootstrap, invoked from Better Auth's
 * `databaseHooks.user.create.after` (see `apps/api/src/auth.ts`). For a brand-new
 * user we create — in one transaction — a default workspace (the user as `owner`),
 * an "İlk Pano" board (the user as board `admin`) seeded with the board template
 * (default lists `Yapılacak` / `Devam Eden` / `Bitti` + a few welcome cards in
 * `Yapılacak`), and the matching `workspace.created` / `board.created` /
 * `list.created` / `card.created` activity events (actor = the new user). The
 * template content lives in `@pusula/domain` constants. See
 * `docs/domain/01-urun-modeli.md` (invariant 11) and
 * `docs/architecture/08-web-ve-mobil.md` (§8.1.3).
 *
 * The caller must treat this as best-effort: on failure, log and carry on —
 * signup must still succeed. The transaction is atomic, so a failure leaves
 * nothing behind; `workspace.list` is then allowed to come back empty and the web
 * app shows the onboarding empty state where the user can create a workspace
 * themselves.
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

    const [board] = await tx
      .insert(boards)
      .values({ workspaceId: workspace.id, title: ONBOARDING_BOARD_TITLE })
      .returning({ id: boards.id, title: boards.title });
    if (!board) throw new Error('onboarding bootstrap: board insert returned no row');

    await tx.insert(boardMembers).values({ boardId: board.id, userId, role: 'admin' });

    await tx.insert(activityEvents).values({
      workspaceId: workspace.id,
      boardId: board.id,
      actorId: userId,
      type: 'board.created',
      payload: { title: board.title, onboarding: true },
    });

    // --- Board template: default lists, plus welcome cards in the first list. ---
    // Positions are fractional (`@pusula/domain/position`); a running cursor keeps
    // each new row after the previous one. `boards.version` is left at its initial
    // value — this *is* the board's first state, and no client is watching yet.
    let listCursor: string | null = null;
    for (const [listIndex, listTitle] of ONBOARDING_LIST_TITLES.entries()) {
      listCursor = positionBetween(listCursor, null);
      const [list] = await tx
        .insert(lists)
        .values({ boardId: board.id, title: listTitle, position: listCursor })
        .returning({ id: lists.id, title: lists.title });
      if (!list) throw new Error('onboarding bootstrap: list insert returned no row');

      await tx.insert(activityEvents).values({
        workspaceId: workspace.id,
        boardId: board.id,
        actorId: userId,
        type: 'list.created',
        payload: { listId: list.id, title: list.title, position: listCursor, onboarding: true },
      });

      // Welcome cards go only into the first list (`Yapılacak`); the others start empty.
      if (listIndex !== 0) continue;
      let cardCursor: string | null = null;
      for (const cardTitle of ONBOARDING_WELCOME_CARDS) {
        cardCursor = positionBetween(cardCursor, null);
        const [card] = await tx
          .insert(cards)
          .values({ boardId: board.id, listId: list.id, title: cardTitle, position: cardCursor })
          .returning({ id: cards.id, title: cards.title });
        if (!card) throw new Error('onboarding bootstrap: card insert returned no row');

        await tx.insert(activityEvents).values({
          workspaceId: workspace.id,
          boardId: board.id,
          cardId: card.id,
          actorId: userId,
          type: 'card.created',
          payload: {
            cardId: card.id,
            listId: list.id,
            title: card.title,
            position: cardCursor,
            onboarding: true,
          },
        });
      }
    }
  });
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
