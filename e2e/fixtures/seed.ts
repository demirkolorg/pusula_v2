/**
 * Deterministic e2e seed (Faz 3D — DEM-45). Run with:
 *   pnpm exec tsx e2e/fixtures/seed.ts        (or `pnpm e2e:seed`)
 *
 * This file is **only** executed via `tsx` (by `global-setup.ts` and each test's
 * `beforeEach`) — never imported by the Playwright-transpiled fixtures/specs, so
 * its `@pusula/db` / `better-auth` imports resolve through the workspace exactly
 * as the apps do. The Playwright side imports the pure-data `./e2e-data` instead.
 *
 * Reset-then-seed (idempotent / safe to re-run): wipes the e2e workspace + users
 * by their fixed ids, then re-inserts a known state:
 *   - test user (`E2E.user`) — workspace `owner`, board `admin`;
 *   - `viewer` user (`E2E.viewer`) — workspace `guest`, board `viewer` (RO);
 *   - `alice` / `bob` (`E2E.alice` / `E2E.bob`) — workspace `member`s, board
 *     `member`s on the shared board (Faz 5D — DEM-86; realtime two-user specs);
 *   - one workspace (`E2E.workspaceId`), one board (`E2E.boardId`);
 *   - 3 lists at known positions (`E2E.listTitles`);
 *   - 2-3 cards per list at known positions (`E2E.cards`).
 *
 * Passwords are hashed with Better Auth's own `hashPassword` and written to the
 * `accounts` table with `providerId: 'credential'` (the shape sign-up produces),
 * so the seeded users can sign in via `/api/auth/sign-in/email`.
 *
 * Uses `@pusula/db` (the package — not modifying it). Assumes the schema is
 * already migrated (`pnpm db:migrate`); `global-setup.ts` does both.
 */
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';
import { hashPassword } from 'better-auth/crypto';
import { positionsBetween } from '@pusula/domain';
import {
  createDb,
  eq,
  accounts,
  boardInvitations,
  boardMembers,
  boards,
  cardLabels,
  cardMembers,
  cards,
  checklists,
  checklistItems,
  comments,
  lists,
  labels,
  notificationPreferences,
  pushTokens,
  reindexSearchDocuments,
  users,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { E2E } from './e2e-data';

type Db = ReturnType<typeof createDb>['db'];

async function resetThenSeed(db: Db): Promise<void> {
  // --- Reset (cascades clean up board_members / lists / cards / accounts) ---
  // Faz 8A (DEM-284) — `e2e-ws-deletable` workspace lifecycle testinde
  // silinebilir; reset bunu da temizler.
  await db.delete(workspaces).where(eq(workspaces.id, E2E.deletable.workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, E2E.search.hiddenWorkspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, E2E.workspaceId));
  for (const u of [E2E.user, E2E.viewer, E2E.alice, E2E.bob, E2E.wsAdmin, E2E.inviteTarget]) {
    await db.delete(users).where(eq(users.id, u.id));
  }
  // Faz 8A (DEM-284) — `auth-flow.spec.ts` signup'la yarattığı kullanıcı
  // sabit e-postada kalır; reseed bu satırı da temizler (e2e-* prefix'i yok).
  await db.delete(users).where(eq(users.email, E2E.signup.email));

  // --- Users + password credentials ---
  const [
    passwordHash,
    viewerPasswordHash,
    alicePasswordHash,
    bobPasswordHash,
    wsAdminPasswordHash,
    inviteTargetPasswordHash,
  ] = await Promise.all([
    hashPassword(E2E.user.password),
    hashPassword(E2E.viewer.password),
    hashPassword(E2E.alice.password),
    hashPassword(E2E.bob.password),
    hashPassword(E2E.wsAdmin.password),
    hashPassword(E2E.inviteTarget.password),
  ]);
  await db.insert(users).values([
    { id: E2E.user.id, name: E2E.user.name, email: E2E.user.email, emailVerified: true },
    { id: E2E.viewer.id, name: E2E.viewer.name, email: E2E.viewer.email, emailVerified: true },
    { id: E2E.alice.id, name: E2E.alice.name, email: E2E.alice.email, emailVerified: true },
    { id: E2E.bob.id, name: E2E.bob.name, email: E2E.bob.email, emailVerified: true },
    // Faz 8A (DEM-284) — permission-matrix.spec.ts için admin tier.
    { id: E2E.wsAdmin.id, name: E2E.wsAdmin.name, email: E2E.wsAdmin.email, emailVerified: true },
    // Faz 8A (DEM-284) — workspace-lifecycle.spec.ts davet kabul akışı için.
    {
      id: E2E.inviteTarget.id,
      name: E2E.inviteTarget.name,
      email: E2E.inviteTarget.email,
      emailVerified: true,
    },
  ]);
  await db.insert(accounts).values([
    {
      id: `${E2E.user.id}-credential`,
      accountId: E2E.user.id,
      providerId: 'credential',
      userId: E2E.user.id,
      password: passwordHash,
    },
    {
      id: `${E2E.viewer.id}-credential`,
      accountId: E2E.viewer.id,
      providerId: 'credential',
      userId: E2E.viewer.id,
      password: viewerPasswordHash,
    },
    {
      id: `${E2E.alice.id}-credential`,
      accountId: E2E.alice.id,
      providerId: 'credential',
      userId: E2E.alice.id,
      password: alicePasswordHash,
    },
    {
      id: `${E2E.bob.id}-credential`,
      accountId: E2E.bob.id,
      providerId: 'credential',
      userId: E2E.bob.id,
      password: bobPasswordHash,
    },
    {
      id: `${E2E.wsAdmin.id}-credential`,
      accountId: E2E.wsAdmin.id,
      providerId: 'credential',
      userId: E2E.wsAdmin.id,
      password: wsAdminPasswordHash,
    },
    {
      id: `${E2E.inviteTarget.id}-credential`,
      accountId: E2E.inviteTarget.id,
      providerId: 'credential',
      userId: E2E.inviteTarget.id,
      password: inviteTargetPasswordHash,
    },
  ]);

  // --- Workspace + memberships ---
  await db.insert(workspaces).values({
    id: E2E.workspaceId,
    name: 'E2E Çalışma Alanı',
    slug: E2E.workspaceSlug,
    ownerId: E2E.user.id,
  });
  await db.insert(workspaceMembers).values([
    { workspaceId: E2E.workspaceId, userId: E2E.user.id, role: 'owner' },
    // The viewer is only a workspace `guest` (no implicit board access) so the
    // explicit board `viewer` row below is what governs their access.
    { workspaceId: E2E.workspaceId, userId: E2E.viewer.id, role: 'guest' },
    // Faz 5D realtime fixture: alice + bob both have full workspace + board
    // edit access so either side can drive the mutation under test.
    { workspaceId: E2E.workspaceId, userId: E2E.alice.id, role: 'member' },
    { workspaceId: E2E.workspaceId, userId: E2E.bob.id, role: 'member' },
    // Faz 8A (DEM-284) — workspace admin (≠ owner) tier; permission-matrix.spec.ts.
    { workspaceId: E2E.workspaceId, userId: E2E.wsAdmin.id, role: 'admin' },
  ]);

  // --- Board + members ---
  await db.insert(boards).values({
    id: E2E.boardId,
    workspaceId: E2E.workspaceId,
    title: E2E.boardTitle,
  });
  await db.insert(boardMembers).values([
    { boardId: E2E.boardId, userId: E2E.user.id, role: 'admin' },
    { boardId: E2E.boardId, userId: E2E.viewer.id, role: 'viewer' },
    { boardId: E2E.boardId, userId: E2E.alice.id, role: 'member' },
    { boardId: E2E.boardId, userId: E2E.bob.id, role: 'member' },
    // Faz 8A (DEM-284) — board admin (workspace admin tier'ı için).
    { boardId: E2E.boardId, userId: E2E.wsAdmin.id, role: 'admin' },
  ]);

  // --- Lists (known positions) ---
  const listPositions = positionsBetween(null, null, E2E.listTitles.length);
  const listRows = E2E.listTitles.map((title, i) => ({
    id: `e2e-list-${i + 1}`,
    boardId: E2E.boardId,
    title,
    position: listPositions[i]!,
  }));
  await db.insert(lists).values(listRows);

  // --- Cards (known positions, per list) ---
  for (let i = 0; i < listRows.length; i++) {
    const titles = E2E.cards[i] ?? [];
    if (titles.length === 0) continue;
    const cardPositions = positionsBetween(null, null, titles.length);
    await db.insert(cards).values(
      titles.map((title, j) => ({
        id: `e2e-card-${i + 1}-${j + 1}`,
        boardId: E2E.boardId,
        listId: listRows[i]!.id,
        title,
        description:
          i === 0 && j === 0 ? `Deterministic search body: ${E2E.search.cardTerm}` : null,
        position: cardPositions[j]!,
      })),
    );
  }

  // DEM-94: Bob starts as a watcher on one deterministic card so the
  // notification e2e can assert watcher comment fan-out without setup UI.
  await db.insert(cardMembers).values({
    cardId: E2E.cardIds.watched,
    userId: E2E.bob.id,
    role: 'watcher',
  });

  // DEM-108: deterministic content for global/board search e2e. This keeps
  // visible card titles unchanged so earlier board interaction specs remain stable.
  await db.insert(labels).values({
    id: E2E.search.labelId,
    boardId: E2E.boardId,
    name: E2E.search.labelName,
    color: 'blue',
  });
  await db.insert(cardLabels).values({
    cardId: E2E.cardIds.assignment,
    labelId: E2E.search.labelId,
  });
  await db.insert(comments).values({
    id: E2E.search.commentId,
    cardId: E2E.cardIds.watched,
    authorId: E2E.user.id,
    body: `Deterministic search comment: ${E2E.search.commentTerm}`,
  });

  // A second workspace/board owned by Bob gives the search e2e a fixed
  // inaccessible result candidate for permission-leak checks.
  await db.insert(workspaces).values({
    id: E2E.search.hiddenWorkspaceId,
    name: 'E2E Hidden Search Workspace',
    slug: 'e2e-hidden-search-workspace',
    ownerId: E2E.bob.id,
  });
  await db.insert(workspaceMembers).values({
    workspaceId: E2E.search.hiddenWorkspaceId,
    userId: E2E.bob.id,
    role: 'owner',
  });
  await db.insert(boards).values({
    id: E2E.search.hiddenBoardId,
    workspaceId: E2E.search.hiddenWorkspaceId,
    title: E2E.search.hiddenTerm,
  });

  await reindexSearchDocuments(db, { workspaceId: E2E.workspaceId });
  await reindexSearchDocuments(db, { workspaceId: E2E.search.hiddenWorkspaceId });

  // ── DEM-274 (Faz 13R) — Raporlama E2E ek pano kümesi ─────────────────────
  // 4 ek pano + her birinde 2 liste + 5 kart varyetesi (overdue/completed/
  // archived). Workspace.executive-summary + board.health preset'lerinin
  // anlamlı sayılar üretebilmesi ve restricted-scope rozeti (alice'in 2 pano
  // dışlanması) için minimum dataset. Saved/schedule kayıtları test
  // runtime'ında oluşturulur (tabula rasa).
  await seedReportsExtraBoards(db);

  // ── Faz 8A (DEM-284) — Genişletilmiş E2E suite fixture'ları ──────────────
  // Her biri ek deterministik veri ekler; mevcut `E2E.*` ID'lerine dokunmaz.
  // workspace-lifecycle.spec.ts → davet + deletable workspace.
  await seedWorkspaceLifecycleExtras(db);
  // board-lifecycle.spec.ts → davet + deletable board + ek label'lar.
  await seedBoardLifecycleExtras(db);
  // card-collaboration.spec.ts → ana kart + arşiv kartı + checklist + item.
  await seedCollabCards(db);
  // notification-flow.spec.ts → bob için global + board-mute preference + push token.
  await seedNotificationExtras(db);
}

async function seedReportsExtraBoards(db: Db): Promise<void> {
  const extraBoards = E2E.reports.extraBoards;

  // 1. Pano kayıtları (workspace içinde).
  await db.insert(boards).values(
    extraBoards.map((b) => ({
      id: b.id,
      workspaceId: E2E.workspaceId,
      title: b.title,
    })),
  );

  // 2. Pano üyelikleri.
  //    - user (workspace owner): tüm ek panolarda `board:admin`.
  //    - alice: yalnız ilk 2 ek panoda (`-2`, `-3`) `board:member`.
  //      (`-4`, `-5` → restricted-scope rozetini görmesi için erişim yok.)
  //    - viewer + bob: ek panolarda yok.
  const memberships: Array<{ boardId: string; userId: string; role: 'admin' | 'member' | 'viewer' }> = [];
  for (const b of extraBoards) {
    memberships.push({ boardId: b.id, userId: E2E.user.id, role: 'admin' });
  }
  memberships.push(
    { boardId: extraBoards[0]!.id, userId: E2E.alice.id, role: 'member' },
    { boardId: extraBoards[1]!.id, userId: E2E.alice.id, role: 'member' },
  );
  await db.insert(boardMembers).values(memberships);

  // 3. Her pano için 2 liste + 5 kart varyetesi.
  //    Kart varyetesi (board başına 5 kart):
  //      - 1 overdue (dueAt geçmiş, completed=false)
  //      - 1 completed (completedAt set)
  //      - 1 due soon (dueAt + 3 gün, completed=false)
  //      - 1 archived (archivedAt set)
  //      - 1 plain (open, dueAt yok)
  //    Bu mix status-breakdown / due-soon / member-contribution gibi
  //    micro-report'ların KPI delta'sı için yeterli varyete sağlar.
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  for (const board of extraBoards) {
    const listPositions = positionsBetween(null, null, 2);
    const listRows = [
      { id: `${board.id}-list-1`, title: 'Yapılacak', boardId: board.id, position: listPositions[0]! },
      { id: `${board.id}-list-2`, title: 'Bitti', boardId: board.id, position: listPositions[1]! },
    ];
    await db.insert(lists).values(listRows);

    const cardPositions = positionsBetween(null, null, 5);
    type CardRow = typeof cards.$inferInsert;
    const cardRows: CardRow[] = [
      {
        id: `${board.id}-card-overdue`,
        boardId: board.id,
        listId: listRows[0]!.id,
        title: 'Geciken iş',
        position: cardPositions[0]!,
        dueAt: new Date(now - sevenDaysMs),
        completed: false,
      },
      {
        id: `${board.id}-card-completed`,
        boardId: board.id,
        listId: listRows[1]!.id,
        title: 'Biten iş',
        position: cardPositions[1]!,
        completed: true,
        completedAt: new Date(now - sevenDaysMs / 2),
        completedBy: E2E.user.id,
      },
      {
        id: `${board.id}-card-due-soon`,
        boardId: board.id,
        listId: listRows[0]!.id,
        title: 'Yakında bitecek',
        position: cardPositions[2]!,
        dueAt: new Date(now + 3 * 24 * 60 * 60 * 1000),
        completed: false,
      },
      {
        id: `${board.id}-card-archived`,
        boardId: board.id,
        listId: listRows[0]!.id,
        title: 'Arşiv iş',
        position: cardPositions[3]!,
        archivedAt: new Date(now - sevenDaysMs * 2),
      },
      {
        id: `${board.id}-card-plain`,
        boardId: board.id,
        listId: listRows[0]!.id,
        title: 'Açık iş',
        position: cardPositions[4]!,
      },
    ];
    await db.insert(cards).values(cardRows);

    // Üyelik atamaları (member-contribution micro-report KPI'si için):
    // overdue → alice (boards 1-2'de), user (boards 3-4'te).
    const overdueAssignee = board.id === extraBoards[0]!.id || board.id === extraBoards[1]!.id
      ? E2E.alice.id
      : E2E.user.id;
    await db.insert(cardMembers).values({
      cardId: `${board.id}-card-overdue`,
      userId: overdueAssignee,
      role: 'assignee',
    });
  }

  // 4. Search reindex — yeni board/list/card satırları search_documents'a düşsün
  //    (DEM-108 reindex helper). reportsRetention veya başka downstream'ler
  //    direkt olarak search'e bakmaz ama tutarlılık için.
  await reindexSearchDocuments(db, { workspaceId: E2E.workspaceId });
}

// ── Faz 8A (DEM-284) — Ek E2E suite seed fonksiyonları ──────────────────────

/**
 * workspace-lifecycle.spec.ts — `E2E.workspaceId` (ana workspace) üzerinde
 * pending + declined davet satırları + ayrı bir `e2e-ws-deletable` workspace
 * (lifecycle silme/leave/rename testlerinin ana workspace'i kırmadan
 * koşabilmesi için). `inviteTarget` kullanıcısı seed.ts başında yaratılmış.
 */
async function seedWorkspaceLifecycleExtras(db: Db): Promise<void> {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  // 1. Pending davet — kabul akışı için. `E2E.inviteTarget` kullanıcısı
  //    `/invitations/accept?token=...` ile kabul edebilir.
  await db.insert(workspaceInvitations).values([
    {
      id: 'e2e-ws-inv-pending',
      workspaceId: E2E.workspaceId,
      email: E2E.inviteTarget.email,
      role: 'member',
      token: E2E.deletable.wsInvitationToken,
      status: 'pending',
      expiresAt: new Date(now + sevenDaysMs),
      invitedById: E2E.user.id,
    },
    {
      // Declined davet — workspace ayarlarında "geçmiş davetler" gösterimi
      // için. Aynı (workspace, email) altında pending olmadığı için partial
      // UNIQUE index ihlal edilmez.
      id: 'e2e-ws-inv-declined',
      workspaceId: E2E.workspaceId,
      email: 'e2e-declined-target@pusula.test',
      role: 'member',
      token: E2E.deletable.wsInvitationDeclinedToken,
      status: 'declined',
      expiresAt: new Date(now + sevenDaysMs),
      invitedById: E2E.user.id,
    },
  ]);

  // 2. Silinebilir workspace — `E2E.user` owner; lifecycle testi bunu silebilir.
  await db.insert(workspaces).values({
    id: E2E.deletable.workspaceId,
    name: 'Silinecek Çalışma Alanı',
    slug: E2E.deletable.workspaceSlug,
    ownerId: E2E.user.id,
  });
  await db.insert(workspaceMembers).values({
    workspaceId: E2E.deletable.workspaceId,
    userId: E2E.user.id,
    role: 'owner',
  });
}

/**
 * board-lifecycle.spec.ts — `E2E.boardId` üzerinde ek label'lar + pending board
 * davet + ayrı `e2e-board-deletable` board (lifecycle silme/arşiv testleri için).
 */
async function seedBoardLifecycleExtras(db: Db): Promise<void> {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  // 1. Pending board davet.
  await db.insert(boardInvitations).values({
    id: 'e2e-board-inv-pending',
    boardId: E2E.boardId,
    email: E2E.deletable.boardInvitationEmail,
    role: 'member',
    token: E2E.deletable.boardInvitationToken,
    status: 'pending',
    expiresAt: new Date(Date.now() + sevenDaysMs),
    invitedById: E2E.user.id,
  });

  // 2. Ek label'lar — etiket CRUD test için (rename/delete).
  await db.insert(labels).values([
    {
      id: E2E.extraLabels.editable.id,
      boardId: E2E.boardId,
      name: E2E.extraLabels.editable.name,
      color: E2E.extraLabels.editable.color,
    },
    {
      id: E2E.extraLabels.deletable.id,
      boardId: E2E.boardId,
      name: E2E.extraLabels.deletable.name,
      color: E2E.extraLabels.deletable.color,
    },
  ]);

  // 3. Silinebilir board — `E2E.user` admin; archive/delete testleri için.
  await db.insert(boards).values({
    id: E2E.deletable.boardId,
    workspaceId: E2E.workspaceId,
    title: 'Silinecek Pano',
  });
  await db.insert(boardMembers).values({
    boardId: E2E.deletable.boardId,
    userId: E2E.user.id,
    role: 'admin',
  });
}

/**
 * card-collaboration.spec.ts — `e2e-list-2`'de 2 ek kart (ana + arşivlenebilir)
 * + 1 checklist + 2 checklist item (biri tamamlanmış, biri açık).
 */
async function seedCollabCards(db: Db): Promise<void> {
  const cardPositions = positionsBetween(null, null, 2);
  await db.insert(cards).values([
    {
      id: E2E.cardIds.collabMain,
      boardId: E2E.boardId,
      listId: 'e2e-list-2',
      title: 'İşbirliği Kartı',
      position: cardPositions[0]!,
    },
    {
      id: E2E.cardIds.collabArchive,
      boardId: E2E.boardId,
      listId: 'e2e-list-2',
      title: 'Arşivlenecek Kart',
      position: cardPositions[1]!,
    },
  ]);

  // Checklist + items (madde 2 önceden tamamlanmış).
  await db.insert(checklists).values({
    id: E2E.collab.checklistId,
    cardId: E2E.cardIds.collabMain,
    title: 'E2E Kontrol Listesi',
    position: positionsBetween(null, null, 1)[0]!,
  });
  const itemPositions = positionsBetween(null, null, E2E.collab.items.length);
  await db.insert(checklistItems).values(
    E2E.collab.items.map((item, i) => ({
      id: item.id,
      checklistId: E2E.collab.checklistId,
      content: item.content,
      position: itemPositions[i]!,
      completed: item.completed,
      completedAt: item.completed ? new Date(Date.now() - 60 * 60 * 1000) : null,
      completedBy: item.completed ? E2E.user.id : null,
    })),
  );
}

/**
 * notification-flow.spec.ts — bob için global default preference + board mute
 * preference (E2E.boardId) + bir push token (revoke testi için).
 *
 * UNIQUE constraint `notification_preferences_scope_uq` COALESCE'lu — global
 * satır (`workspaceId/boardId/cardId = NULL`) yalnız bir kez insert edilebilir;
 * reset aşaması user satırını cascade temizler, burada güvenle eklenir.
 */
async function seedNotificationExtras(db: Db): Promise<void> {
  await db.insert(notificationPreferences).values([
    {
      id: E2E.notifPrefs.bobGlobalId,
      userId: E2E.bob.id,
      workspaceId: null,
      boardId: null,
      cardId: null,
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: true,
      emailMode: 'instant',
    },
    {
      // Board mute — bob `E2E.boardId`'deki aktiviteyi (mention dışında)
      // sustırır; rule engine `mute_level='all'` davranışını test eder.
      id: E2E.notifPrefs.bobBoardMutedId,
      userId: E2E.bob.id,
      workspaceId: null,
      boardId: E2E.boardId,
      cardId: null,
      muteLevel: 'all',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: true,
      emailMode: 'instant',
    },
  ]);

  await db.insert(pushTokens).values({
    id: E2E.pushTokens.bobIos.id,
    userId: E2E.bob.id,
    token: E2E.pushTokens.bobIos.token,
    platform: E2E.pushTokens.bobIos.platform,
    deviceName: "Bob'un iPhone",
    revokedAt: null,
  });
}

export async function seed(): Promise<void> {
  const { db, pool } = createDb();
  try {
    await resetThenSeed(db);
  } finally {
    await pool.end();
  }
}

// Run when invoked directly (`tsx e2e/fixtures/seed.ts`).
const invokedDirectly =
  typeof argv[1] === 'string' && import.meta.url === pathToFileURL(argv[1]).href;
if (invokedDirectly) {
  seed()
    .then(() => {
      console.warn('[e2e] seeded e2e workspace/board.');
    })
    .catch((err) => {
      console.error('[e2e] seed failed:', err);
      process.exitCode = 1;
    });
}
