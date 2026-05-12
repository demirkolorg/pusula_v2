import { randomBytes } from 'node:crypto';
import { activityEvents, boardMembers, boards, getDb, workspaceMembers, workspaces } from '@pusula/db';
import { ONBOARDING_BOARD_TITLE, ONBOARDING_WORKSPACE_NAME } from '@pusula/domain';

/**
 * Best-effort onboarding bootstrap, invoked from Better Auth's
 * `databaseHooks.user.create.after` (see `apps/api/src/auth.ts`). For a brand-new
 * user we create — in one transaction — a default workspace (the user as `owner`),
 * an empty "İlk Pano" board (the user as board `admin`), and the matching
 * `workspace.created` / `board.created` activity events. Default lists/cards are
 * out of scope (separate work — board template). See `docs/domain/01-urun-modeli.md`
 * (invariant 11) and `docs/architecture/08-web-ve-mobil.md` (§8.1.3).
 *
 * The caller must treat this as best-effort: on failure, log and carry on —
 * signup must still succeed. `workspace.list` is allowed to come back empty; the
 * web app then shows the onboarding empty state where the user can create a
 * workspace themselves.
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
