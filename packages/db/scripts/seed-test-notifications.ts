/**
 * Test bildirimi tohumu — yeni detaylı bildirim metinlerini test etmek için.
 *
 * Kullanım:
 *   pnpm exec tsx scripts/seed-test-notifications.ts [email]
 *
 * Varsayılan email: demirkol.abdullah93@gmail.com
 *
 * Önce DB'de o kullanıcıya ait gerçek bir kart/board/workspace bulur;
 * bulamazsa kendi workspace'ini oluşturmaz — hata verir.
 */
import { argv } from 'node:process';
import { createDb, eq, sql, isNull, users, notifications, workspaces, boards, cards, boardMembers } from '@pusula/db';

const targetEmail = argv[2] ?? 'demirkol.abdullah93@gmail.com';

async function main() {
  const { db, pool } = createDb();

  try {
    // 1. Kullanıcıyı bul
    const [user] = await db.select().from(users).where(eq(users.email, targetEmail)).limit(1);
    if (!user) throw new Error(`Kullanıcı bulunamadı: ${targetEmail}`);
    console.log(`✓ Kullanıcı: ${user.name} (${user.id})`);

    // 2. Erişimi olan bir kart bul
    const rows = await db
      .select({
        workspaceId: workspaces.id,
        boardId: boards.id,
        cardId: cards.id,
        cardTitle: cards.title,
      })
      .from(cards)
      .innerJoin(boards, eq(boards.id, cards.boardId))
      .innerJoin(workspaces, eq(workspaces.id, boards.workspaceId))
      .innerJoin(boardMembers, sql`${boardMembers.boardId} = ${boards.id} AND ${boardMembers.userId} = ${user.id}`)
      .where(isNull(cards.archivedAt))
      .limit(3);

    if (rows.length === 0) throw new Error('Kullanıcıya ait kart bulunamadı.');

    const { workspaceId, boardId, cardId, cardTitle } = rows[0]!;
    console.log(`✓ Kart: "${cardTitle}" (${cardId})`);

    // 3. Kendimize bildirim gönderecek başka bir kullanıcı bul (actor)
    const actorRows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(sql`${users.id} != ${user.id}`)
      .limit(1);

    const actor = actorRows[0] ?? { id: user.id, name: user.name + ' (self)' };
    console.log(`✓ Aktör: ${actor.name} (${actor.id})`);

    // 4. Mevcut test bildirimlerini temizle
    await db
      .delete(notifications)
      .where(sql`${notifications.recipientId} = ${user.id} AND ${notifications.payload}->>'_test' = 'true'`);

    // 5. Test bildirimlerini oluştur
    const now = Date.now();
    const testNotifications = [
      {
        recipientId: user.id,
        actorId: actor.id,
        type: 'checklist_item_completed' as const,
        workspaceId,
        boardId,
        cardId,
        payload: {
          _test: 'true',
          actorName: actor.name,
          cardTitle,
          cardId,
          boardId,
          workspaceId,
          content: 'Figma wireframe\'i bitir',
          itemId: 'fake-item-id-1',
        },
        createdAt: new Date(now),
      },
      {
        recipientId: user.id,
        actorId: actor.id,
        type: 'comment_reply' as const,
        workspaceId,
        boardId,
        cardId,
        payload: {
          _test: 'true',
          actorName: actor.name,
          cardTitle,
          cardId,
          boardId,
          workspaceId,
          commentPreview: 'API bağlantısını da kontrol ettim, hazır görünüyor.',
          commentId: 'fake-comment-id-1',
        },
        createdAt: new Date(now + 1),
      },
      {
        recipientId: user.id,
        actorId: actor.id,
        type: 'mention' as const,
        workspaceId,
        boardId,
        cardId,
        payload: {
          _test: 'true',
          actorName: actor.name,
          cardTitle,
          cardId,
          boardId,
          workspaceId,
          commentPreview: 'Bu konuda @sen ne düşünüyorsun?',
          commentId: 'fake-comment-id-2',
        },
        createdAt: new Date(now + 2),
      },
      {
        recipientId: user.id,
        actorId: actor.id,
        type: 'attachment_added' as const,
        workspaceId,
        boardId,
        cardId,
        payload: {
          _test: 'true',
          actorName: actor.name,
          cardTitle,
          cardId,
          boardId,
          workspaceId,
          fileName: 'tasarim-v2-final.pdf',
          attachmentId: 'fake-attachment-id-1',
        },
        createdAt: new Date(now + 3),
      },
      {
        recipientId: user.id,
        actorId: actor.id,
        type: 'checklist_item_added' as const,
        workspaceId,
        boardId,
        cardId,
        payload: {
          _test: 'true',
          actorName: actor.name,
          cardTitle,
          cardId,
          boardId,
          workspaceId,
          content: 'Kullanıcı testlerini yap',
          itemId: 'fake-item-id-2',
        },
        createdAt: new Date(now + 4),
      },
      {
        recipientId: user.id,
        actorId: actor.id,
        type: 'card_assigned' as const,
        workspaceId,
        boardId,
        cardId,
        payload: {
          _test: 'true',
          actorName: actor.name,
          cardTitle,
          cardId,
          boardId,
          workspaceId,
        },
        createdAt: new Date(now + 5),
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.insert(notifications).values(testNotifications as any[]);

    console.log(`\n✅ ${testNotifications.length} test bildirimi eklendi:\n`);
    for (const n of testNotifications) {
      console.log(`  • [${n.type}] payload: ${JSON.stringify(n.payload, null, 2).split('\n').slice(1).join('\n    ')}`);
    }
    console.log('\nUygulamayı yenileyince bildirimler görünmeli.');
    console.log('Temizlemek için tekrar çalıştır (önceki _test bildirimlerini siler).');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('HATA:', err);
  process.exitCode = 1;
});
