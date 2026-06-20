/**
 * Test betiği — bildirim "scroll + flash" derin-link davranışını denemek için
 * hedefli (GERÇEK comment / checklist item / attachment id'li) örnek bildirimler
 * üretir. Üretilen satırlar `notifications` tablosuna recipient = verilen
 * kullanıcı olacak şekilde OKUNMAMIŞ yazılır → notification center'da görünür.
 *
 * Not: scroll + flash için id'lerin GERÇEK olması şarttır (fake id ile hedef
 * DOM'da/ekranda bulunamaz). Bu yüzden hedefler DB'den canlı seçilir.
 *
 * Çalıştırma (DATABASE_URL lokal/dev DB'ye bakmalı):
 *   pnpm --filter @pusula/db exec tsx scripts/seed-test-notifications.ts            # KEŞİF (yazmaz)
 *   pnpm --filter @pusula/db exec tsx scripts/seed-test-notifications.ts --commit   # bildirimleri EKLE
 *   pnpm --filter @pusula/db exec tsx scripts/seed-test-notifications.ts --clean    # sadece test bildirimlerini SİL
 *   ... --email=baska@ornek.com                                                     # farklı kullanıcı
 *
 * Üretilen bildirimler `payload.testSeed = true` taşır; `--commit` her seferinde
 * önce eski test bildirimlerini siler (duplikasyon olmaz). Yalnız lokal/test
 * amaçlı — üretim DB'sinde çalıştırmayın.
 */
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  createDb,
  attachments,
  boardMembers,
  boards,
  cards,
  checklistItems,
  checklists,
  comments,
  notifications,
  users,
  workspaceMembers,
} from '@pusula/db';

const arg = (k: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];

/**
 * Tiptap JSON yorum body'sini düz metin önizlemesine indirger — gerçek
 * üretimdeki `bodyPreview` (packages/api comment.ts) ile aynı mantığın hafif
 * kopyası (db paketi api'ye bağımlı olamaz). Aksi halde önizleme ham JSON
 * (`{"type":"doc"...`) görünür.
 */
function previewFromBody(body: string, max = 80): string {
  const buf: string[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;
    if (rec.type === 'text' && typeof rec.text === 'string') buf.push(rec.text);
    if (rec.type === 'mention' && rec.attrs && typeof rec.attrs === 'object') {
      const label = (rec.attrs as Record<string, unknown>).label;
      if (typeof label === 'string') buf.push('@' + label);
    }
    if (Array.isArray(rec.content)) {
      const before = buf.length;
      for (const c of rec.content) visit(c);
      if (
        (rec.type === 'paragraph' || rec.type === 'listItem' || rec.type === 'heading') &&
        buf.length > before
      ) {
        buf.push(' ');
      }
    }
  };
  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      visit(JSON.parse(body));
    } catch {
      buf.push(body);
    }
  } else {
    buf.push(body);
  }
  const flat = buf.join('').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
const EMAIL = arg('email') ?? 'demirkol.abdullah93@gmail.com';
const COMMIT = process.argv.includes('--commit');
const CLEAN = process.argv.includes('--clean');

async function main(): Promise<void> {
  const { db, pool } = createDb();
  try {
    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.email, EMAIL))
      .limit(1);
    if (!user) throw new Error(`Kullanıcı bulunamadı: ${EMAIL}`);
    console.log(`Kullanıcı: ${user.name} <${user.email}> (${user.id})`);

    // Eski test bildirimlerini temizle (idempotent — duplikasyon olmasın).
    if (COMMIT || CLEAN) {
      const del = await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.recipientId, user.id),
            sql`${notifications.payload}->>'testSeed' = 'true'`,
          ),
        )
        .returning({ id: notifications.id });
      console.log(`Silinen eski test bildirimi: ${del.length}`);
      if (CLEAN) return;
    }

    // Kullanıcının eriştiği board'lar: explicit board üyeliği ∪ non-guest
    // workspace üyeliğindeki tüm board'lar.
    const bm = await db
      .select({ boardId: boardMembers.boardId })
      .from(boardMembers)
      .where(eq(boardMembers.userId, user.id));
    const wm = await db
      .select({ workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, user.id));
    const wsIds = wm.filter((r) => r.role !== 'guest').map((r) => r.workspaceId);
    const wsBoards = wsIds.length
      ? await db.select({ id: boards.id }).from(boards).where(inArray(boards.workspaceId, wsIds))
      : [];
    const boardIds = [...new Set([...bm.map((r) => r.boardId), ...wsBoards.map((b) => b.id)])];
    if (!boardIds.length) {
      throw new Error('Bu kullanıcının eriştiği board yok — önce bir board/kart oluşturun.');
    }
    console.log(`Erişilebilir board sayısı: ${boardIds.length}`);

    // Hedefler — erişilebilir board'lardaki en güncel yorum / checklist maddesi /
    // ek. (Son sıradakini seçeriz ki kart içinde aşağıda olsun → scroll belli olur.)
    const [cmt] = await db
      .select({
        id: comments.id,
        body: comments.body,
        cardId: cards.id,
        cardTitle: cards.title,
        boardId: boards.id,
        boardName: boards.title,
        workspaceId: boards.workspaceId,
      })
      .from(comments)
      .innerJoin(cards, eq(comments.cardId, cards.id))
      .innerJoin(boards, eq(cards.boardId, boards.id))
      .where(
        and(
          inArray(cards.boardId, boardIds),
          isNull(comments.deletedAt),
          isNull(comments.checklistItemId),
        ),
      )
      .orderBy(desc(comments.createdAt))
      .limit(1);

    const [ci] = await db
      .select({
        id: checklistItems.id,
        content: checklistItems.content,
        cardId: cards.id,
        cardTitle: cards.title,
        boardId: boards.id,
        boardName: boards.title,
        workspaceId: boards.workspaceId,
      })
      .from(checklistItems)
      .innerJoin(checklists, eq(checklistItems.checklistId, checklists.id))
      .innerJoin(cards, eq(checklists.cardId, cards.id))
      .innerJoin(boards, eq(cards.boardId, boards.id))
      .where(inArray(cards.boardId, boardIds))
      .orderBy(desc(checklistItems.position))
      .limit(1);

    const [att] = await db
      .select({
        id: attachments.id,
        fileName: attachments.fileName,
        cardId: cards.id,
        cardTitle: cards.title,
        boardId: boards.id,
        boardName: boards.title,
        workspaceId: boards.workspaceId,
      })
      .from(attachments)
      .innerJoin(cards, eq(attachments.cardId, cards.id))
      .innerJoin(boards, eq(cards.boardId, boards.id))
      .where(and(inArray(cards.boardId, boardIds), isNotNull(attachments.committedAt)))
      .orderBy(desc(attachments.createdAt))
      .limit(1);

    const now = Date.now();
    const rows: (typeof notifications.$inferInsert)[] = [];

    if (cmt) {
      rows.push({
        recipientId: user.id,
        actorId: user.id,
        type: 'comment_reply',
        workspaceId: cmt.workspaceId,
        boardId: cmt.boardId,
        cardId: cmt.cardId,
        createdAt: new Date(now),
        payload: {
          testSeed: true,
          activityType: 'comment.created',
          notificationType: 'comment_reply',
          actorName: 'Test Bildirimi',
          actorUserId: user.id,
          cardId: cmt.cardId,
          boardId: cmt.boardId,
          workspaceId: cmt.workspaceId,
          cardTitle: cmt.cardTitle,
          boardName: cmt.boardName,
          commentId: cmt.id,
          commentPreview: previewFromBody(cmt.body),
        },
      });
    }

    if (ci) {
      rows.push({
        recipientId: user.id,
        actorId: user.id,
        type: 'checklist_item_added',
        workspaceId: ci.workspaceId,
        boardId: ci.boardId,
        cardId: ci.cardId,
        createdAt: new Date(now - 60_000),
        payload: {
          testSeed: true,
          activityType: 'checklist.item_added',
          notificationType: 'checklist_item_added',
          actorName: 'Test Bildirimi',
          actorUserId: user.id,
          cardId: ci.cardId,
          boardId: ci.boardId,
          workspaceId: ci.workspaceId,
          cardTitle: ci.cardTitle,
          boardName: ci.boardName,
          // Yalnız `itemId` (= highlightItemId): maddeye scroll + flash, yorum
          // thread'i AÇMAZ. (`checklistItemId` bilinçli olarak yok — o, madde
          // yorum bildirimleri içindir ve thread sheet açar.)
          itemId: ci.id,
          content: ci.content,
        },
      });
    }

    if (att) {
      rows.push({
        recipientId: user.id,
        actorId: user.id,
        type: 'attachment_added',
        workspaceId: att.workspaceId,
        boardId: att.boardId,
        cardId: att.cardId,
        createdAt: new Date(now - 120_000),
        payload: {
          testSeed: true,
          activityType: 'attachment.added',
          notificationType: 'attachment_added',
          actorName: 'Test Bildirimi',
          actorUserId: user.id,
          cardId: att.cardId,
          boardId: att.boardId,
          workspaceId: att.workspaceId,
          cardTitle: att.cardTitle,
          boardName: att.boardName,
          attachmentId: att.id,
          fileName: att.fileName,
        },
      });
    }

    console.log('\nBulunan hedefler:');
    console.log(
      '  Yorum            :',
      cmt
        ? `"${previewFromBody(cmt.body, 40)}" → kart "${cmt.cardTitle}" / board "${cmt.boardName}"`
        : 'YOK',
    );
    console.log(
      '  Checklist maddesi:',
      ci ? `"${ci.content.slice(0, 40)}" → kart "${ci.cardTitle}"` : 'YOK',
    );
    console.log('  Ek (attachment)  :', att ? `"${att.fileName}" → kart "${att.cardTitle}"` : 'YOK');

    if (!rows.length) {
      throw new Error(
        "Hiç hedef bulunamadı — erişilebilir board'larda yorum/checklist maddesi/ek olan kart yok.",
      );
    }

    if (!COMMIT) {
      console.log(
        `\n[KEŞİF MODU] ${rows.length} bildirim eklenmeye HAZIR — yazılmadı. Eklemek için sona --commit ekleyin.`,
      );
      return;
    }

    await db.insert(notifications).values(rows);
    console.log(
      `\n✓ ${rows.length} okunmamış test bildirimi eklendi. Notification center'ı açıp tıkla → scroll + flash.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Hata:', e);
  process.exitCode = 1;
});
