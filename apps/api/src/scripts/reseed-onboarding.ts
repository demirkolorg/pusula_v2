/**
 * One-shot script: re-seed an existing user's onboarding board with the current
 * showcase template. Used when the showcase definition changes and we want a
 * specific live user (e.g. a developer's own account) to see the new layout
 * without going through signup again.
 *
 * Behaviour: inside a single transaction we (1) look up the user by email,
 * (2) find their onboarding workspace (`workspaces.slug` LIKE `calisma-alanim-%`
 * + the user is `workspace_members.role='owner'`), (3) delete every board in
 * that workspace (FK cascades drop lists / cards / labels / board_members /
 * comments / checklists / activity_events / realtime_events / search_documents),
 * then (4) call `seedShowcaseBoard` to lay a fresh showcase down. The workspace
 * itself is preserved (so its id and slug don't change, and any external links
 * keep working).
 *
 * Destructive — only run after confirming the user has no real custom content
 * on the old board.
 *
 * Usage (from repo root):
 *   pnpm --filter @pusula/api-server exec tsx src/scripts/reseed-onboarding.ts <email>
 */
import { and, boards, createDb, eq, sql, users, workspaceMembers, workspaces } from '@pusula/db';
import { seedShowcaseBoard } from '../bootstrap';

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('usage: tsx src/scripts/reseed-onboarding.ts <email>');
    process.exitCode = 1;
    return;
  }

  const { db, pool } = createDb();
  try {
    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!user) {
      console.error(`[reseed] no user found for email "${email}"`);
      process.exitCode = 1;
      return;
    }

    const ownedOnboardingWorkspaces = await db
      .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name })
      .from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(
        and(
          eq(workspaceMembers.userId, user.id),
          eq(workspaceMembers.role, 'owner'),
          sql`${workspaces.slug} LIKE 'calisma-alanim-%'`,
        ),
      )
      .orderBy(workspaces.createdAt);

    if (ownedOnboardingWorkspaces.length === 0) {
      console.error(
        `[reseed] user ${user.email} (${user.id}) owns no onboarding workspace (slug LIKE 'calisma-alanim-%').`,
      );
      process.exitCode = 1;
      return;
    }

    const workspace = ownedOnboardingWorkspaces[0]!;
    if (ownedOnboardingWorkspaces.length > 1) {
      console.warn(
        `[reseed] user owns ${ownedOnboardingWorkspaces.length} onboarding workspaces; using the oldest (${workspace.slug}).`,
      );
    }

    console.warn(
      `[reseed] user=${user.email} (${user.id}) workspace=${workspace.slug} (${workspace.id})`,
    );

    const result = await db.transaction(async (tx) => {
      const deletedBoards = await tx
        .delete(boards)
        .where(eq(boards.workspaceId, workspace.id))
        .returning({ id: boards.id, title: boards.title });

      const seed = await seedShowcaseBoard(tx, {
        workspaceId: workspace.id,
        actorId: user.id,
      });

      return { deletedBoards, newBoardId: seed.boardId };
    });

    console.warn(
      `[reseed] deleted ${result.deletedBoards.length} board(s) (cascade): ${result.deletedBoards
        .map((b) => `"${b.title}"`)
        .join(', ') || '(none)'}`,
    );
    console.warn(`[reseed] seeded showcase board id=${result.newBoardId}`);
    console.warn('[reseed] done.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[reseed] failed:', err);
  process.exitCode = 1;
});
