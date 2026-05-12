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
    case 'card.created':
      return `${who} kartı oluşturdu`;
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
      const archived = typeof p === 'object' && p !== null ? (p as Record<string, unknown>).archived : undefined;
      return archived === false ? `${who} kartı geri yükledi` : `${who} kartı arşivledi`;
    }
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
    case 'checklist.created': {
      const title = str(p, 'title');
      return title ? `${who} bir yapılacaklar listesi ekledi: “${title}”` : `${who} bir yapılacaklar listesi ekledi`;
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
    default:
      return `${who} bir işlem yaptı (${event.type})`;
  }
}
