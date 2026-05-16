/**
 * Maps a card `activity_events` row to a human-readable Turkish summary line.
 * Pure (no React / tRPC) so it can be unit-tested in isolation. The payload
 * shapes mirror what the routers write (`packages/api/src/routers/*`); anything
 * unrecognised falls back to a generic "<actor> bir işlem yaptı (<type>)".
 */

export type CardActivityEvent = {
  id: string;
  type: string;
  actorId: string | null;
  actorName: string | null;
  /** Actor avatar URL (`null` when unset or the actor was deleted — DEM-160). */
  actorImage: string | null;
  payload: unknown;
  createdAt: Date | string;
};

/** Narrow `payload` to a plain object and read a string key, else `undefined`. */
function str(payload: unknown, key: string): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Build the summary for a single activity row. `unknownActor` is the fallback
 * display name when the actor was deleted (`actorId`/`actorName` null).
 */
export function summarizeCardActivity(event: CardActivityEvent, unknownActor: string): string {
  const who = event.actorName?.trim() || unknownActor;
  const p = event.payload;

  switch (event.type) {
    case 'board.created':
      return `${who} panoyu oluşturdu`;
    case 'board.renamed': {
      const from = str(p, 'fromTitle');
      const to = str(p, 'toTitle');
      return from && to
        ? `${who} panoyu yeniden adlandırdı: “${from}” → “${to}”`
        : `${who} panoyu yeniden adlandırdı`;
    }
    case 'board.archived': {
      const archived =
        typeof p === 'object' && p !== null ? (p as Record<string, unknown>).archived : undefined;
      return archived === false ? `${who} panoyu geri yükledi` : `${who} panoyu arşivledi`;
    }
    case 'board.background_changed':
      return `${who} panonun arka planını değiştirdi`;
    case 'board.background_cleared':
      return `${who} panonun arka planını kaldırdı`;
    case 'board.updated': {
      const fromIcon = str(p, 'fromIcon');
      return fromIcon !== undefined
        ? `${who} panonun simgesini değiştirdi`
        : `${who} pano ayarlarını güncelledi`;
    }
    case 'board.member_added':
      return `${who} panoya bir üye ekledi`;
    case 'board.member_removed':
      return `${who} panodan bir üye çıkardı`;
    case 'board.member_role_changed':
      return `${who} bir pano üyesinin rolünü değiştirdi`;
    case 'board.member_invited':
      return `${who} panoya bir davet gönderdi`;
    case 'board.invitation_revoked':
      return `${who} bir pano davetini iptal etti`;
    case 'list.created': {
      const title = str(p, 'title');
      return title ? `${who} liste ekledi: “${title}”` : `${who} liste ekledi`;
    }
    case 'list.renamed': {
      const from = str(p, 'fromTitle');
      const to = str(p, 'toTitle');
      return from && to
        ? `${who} listeyi yeniden adlandırdı: “${from}” → “${to}”`
        : `${who} listeyi yeniden adlandırdı`;
    }
    case 'list.archived': {
      const archived =
        typeof p === 'object' && p !== null ? (p as Record<string, unknown>).archived : undefined;
      return archived === false ? `${who} listeyi geri yükledi` : `${who} listeyi arşivledi`;
    }
    case 'list.moved':
      return `${who} listeyi taşıdı`;
    case 'list.color_changed':
      return `${who} liste rengini değiştirdi`;
    case 'list.color_cleared':
      return `${who} liste rengini kaldırdı`;
    case 'list.icon_changed':
      return `${who} listenin simgesini değiştirdi`;
    case 'list.icon_cleared':
      return `${who} listenin simgesini kaldırdı`;
    case 'card.created':
      return `${who} kartı oluşturdu`;
    case 'card.moved':
      return `${who} kartı taşıdı`;
    case 'card.renamed': {
      const from = str(p, 'fromTitle');
      const to = str(p, 'toTitle');
      return from && to
        ? `${who} kartı yeniden adlandırdı: “${from}” → “${to}”`
        : `${who} kartı yeniden adlandırdı`;
    }
    case 'card.description_changed':
      return `${who} açıklamayı güncelledi`;
    case 'card.due_set':
      return `${who} bir son tarih belirledi`;
    case 'card.due_cleared':
      return `${who} son tarihi kaldırdı`;
    case 'card.archived': {
      const archived =
        typeof p === 'object' && p !== null ? (p as Record<string, unknown>).archived : undefined;
      return archived === false ? `${who} kartı geri yükledi` : `${who} kartı arşivledi`;
    }
    case 'card.completed':
      return `${who} kartı tamamlandı olarak işaretledi`;
    case 'card.uncompleted':
      return `${who} kartın tamamlanmasını geri aldı`;
    case 'card.cover_changed':
      return `${who} kartın kapak rengini değiştirdi`;
    case 'card.cover_cleared':
      return `${who} kartın kapak rengini kaldırdı`;
    case 'card.cover_image_changed':
      return `${who} kartın kapak fotoğrafını değiştirdi`;
    case 'card.cover_image_cleared':
      return `${who} kartın kapak fotoğrafını kaldırdı`;
    case 'card.member_added': {
      const role = str(p, 'role');
      return role === 'assignee'
        ? `${who} bir kişiyi sorumlu olarak ekledi`
        : role === 'watcher'
          ? `${who} bir izleyen ekledi`
          : `${who} karta bir üye ekledi`;
    }
    case 'card.member_removed':
      return `${who} karttan bir üye çıkardı`;
    case 'card.label_added':
      return `${who} bir etiket ekledi`;
    case 'card.label_removed':
      return `${who} bir etiket kaldırdı`;
    case 'comment.created':
      return `${who} yorum ekledi`;
    case 'comment.updated':
      return `${who} bir yorumu düzenledi`;
    case 'comment.deleted':
      return `${who} bir yorumu sildi`;
    case 'comment.mentioned':
      return `${who} bir yorumda bir kullanıcıdan bahsetti`;
    case 'checklist.created': {
      const title = str(p, 'title');
      return title
        ? `${who} bir yapılacaklar listesi ekledi: “${title}”`
        : `${who} bir yapılacaklar listesi ekledi`;
    }
    case 'checklist.item_added': {
      const content = str(p, 'content');
      return content ? `${who} bir madde ekledi: “${content}”` : `${who} bir madde ekledi`;
    }
    case 'checklist.item_checked':
      return `${who} bir maddeyi tamamladı`;
    case 'checklist.item_unchecked':
      return `${who} bir maddenin tamamlanmasını geri aldı`;
    case 'checklist.item_removed':
      return `${who} bir maddeyi sildi`;
    case 'attachment.added': {
      const fileName = str(p, 'fileName');
      return fileName ? `${who} bir dosya ekledi: “${fileName}”` : `${who} bir dosya ekledi`;
    }
    case 'attachment.removed': {
      const fileName = str(p, 'fileName');
      return fileName ? `${who} bir dosya kaldırdı: “${fileName}”` : `${who} bir dosya kaldırdı`;
    }
    default:
      return `${who} bir işlem yaptı`;
  }
}
