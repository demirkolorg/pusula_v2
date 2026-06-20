/**
 * Bildirim detay ekranının "Değişiklikler" (önce → sonra) çekirdeği — mobil
 * tarafı (Faz 5+6, 2026-06-21). Saf before/after diff mantığı `@pusula/domain`
 * `buildActivityChanges`'te (web + mobil paylaşır); bu modül **mobil-özel**
 * enjeksiyonu (Türkçe alan etiketleri, `formatBytes`, boolean/rol kelimeleri)
 * bağlar. Web `apps/web/.../activity-detail.ts` simetriği.
 *
 * Saf modül — RN/Expo importu yok (yalnız `strings` + `attachment-format`
 * `formatBytes`); `notification-audit.test.ts` ile birim test edilir.
 */
import { buildActivityChanges as buildActivityChangesDomain } from '@pusula/domain';
import { formatBytes } from '@/lib/attachment-format';
import { strings } from '@/lib/strings';

/**
 * Detay ekranı "Değişiklikler" bölümündeki tek satır (mobil-yüzlü şekil —
 * `label` çözülmüş, `field` anahtarı atılmış). `truncated` yalnız kaynak alan
 * 2KB audit sınırını aşıp kırpıldıysa taşınır.
 */
export type NotificationChange =
  | { kind: 'diff'; label: string; from: string; to: string; truncated?: true }
  | { kind: 'value'; label: string; value: string; truncated?: true };

const auditCopy = strings.notifications.audit;

/** Bilinmeyen anahtarlar için yedek: camelCase/snake → "Başlık Düzeni". */
function humanize(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.length > 0 ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

/** Diff çifti suffix'inin (`fromTitle`/`toTitle` → "Başlık") Türkçe etiketi. */
function fieldLabel(suffix: string): string {
  return auditCopy.fields[suffix.toLowerCase()] ?? humanize(suffix);
}

/** Tekil skaler anahtarın (`fileName` → "Dosya") Türkçe etiketi. */
function valueLabel(key: string): string {
  return auditCopy.values[key.toLowerCase()] ?? humanize(key);
}

/** Skaler payload değerini ekrana çevirir; alan adına göre Türkçeleştirir. */
function formatCell(name: string, raw: unknown): string {
  const lower = name.toLowerCase();
  if (raw == null) return '';
  if (typeof raw === 'boolean') {
    if (lower === 'archived') return raw ? auditCopy.archivedYes : auditCopy.archivedNo;
    return raw ? auditCopy.booleanYes : auditCopy.booleanNo;
  }
  if (typeof raw === 'number') {
    if (lower.includes('size') || lower.includes('bytes')) return formatBytes(raw);
    return String(raw);
  }
  if (typeof raw === 'string') {
    if (lower === 'role') {
      if (raw === 'assignee') return auditCopy.roleAssignee;
      if (raw === 'watcher') return auditCopy.roleWatcher;
    }
    return raw;
  }
  return '';
}

/**
 * Bir aktivite payload'ı için mobil-yüzlü değişiklik listesini üret. İnce
 * sarmal: çift tespiti / skaler toplama / kırpma bayrağı domain tarafında;
 * burada yalnız Türkçe etiket + `formatBytes` + boolean/rol kelimeleri enjekte
 * edilir. Düz obje olmayan girdi boş liste döndürür (eski/veri-yok bildirimler).
 */
export function buildNotificationChanges(payload: unknown): NotificationChange[] {
  const changes = buildActivityChangesDomain(payload, {
    fieldLabel,
    valueLabel,
    formatBytes,
    formatCell,
  });

  return changes.map((change) => {
    if (change.kind === 'diff') {
      const row: NotificationChange = {
        kind: 'diff',
        label: change.label,
        from: change.from,
        to: change.to,
      };
      if (change.truncated) row.truncated = true;
      return row;
    }
    const row: NotificationChange = { kind: 'value', label: change.label, value: change.value };
    if (change.truncated) row.truncated = true;
    return row;
  });
}

/** Bildirim/aktivite tipinin kategori önekini (`card.renamed` → `card`) çözer. */
function typePrefix(type: string): string {
  // Hem nokta (`card.renamed`) hem alt çizgi (`card_renamed`) ayraçlarını destekle.
  const dot = type.indexOf('.');
  if (dot > 0) return type.slice(0, dot);
  const underscore = type.indexOf('_');
  return underscore > 0 ? type.slice(0, underscore) : type;
}

/**
 * Bildirim tipinin insan-okunur **kategori** etiketi (örn. "Kart", "Pano").
 * Web `activityCategoryLabel` mobil karşılığı — detay başlığında "Bildirim
 * tipi" satırında gösterilir. Bilinmeyen kategori → "Diğer".
 */
export function notificationCategoryLabel(type: string): string {
  const copy = strings.notifications.detail.categories;
  switch (typePrefix(type)) {
    case 'workspace':
      return copy.workspace;
    case 'board':
      return copy.board;
    case 'list':
      return copy.list;
    case 'card':
      return copy.card;
    case 'comment':
    case 'mention':
      return copy.comment;
    case 'checklist':
      return copy.checklist;
    case 'attachment':
      return copy.attachment;
    case 'due':
      return copy.dueDate;
    case 'member':
      return copy.membership;
    default:
      return copy.other;
  }
}
