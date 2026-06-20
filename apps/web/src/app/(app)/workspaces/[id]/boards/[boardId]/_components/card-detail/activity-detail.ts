/**
 * Web-side helpers for the activity detail modal: category + Turkish label
 * mapping, plus a thin wrapper over the shared `@pusula/domain`
 * `buildActivityChanges` diff engine. The pure before/after diff logic lives in
 * the domain `audit/` lib (so web + mobile share it); this file injects the
 * web-specific copy (Turkish field labels, `formatBytes`, boolean/role wording).
 * No tRPC so it can be unit-tested in isolation (mirrors `activity-summary.ts`).
 */

import { buildActivityChanges as buildActivityChangesDomain } from '@pusula/domain';

import { formatBytes } from '@/lib/format';

export type ActivityCategory =
  | 'workspace'
  | 'board'
  | 'list'
  | 'card'
  | 'comment'
  | 'checklist'
  | 'attachment'
  | 'other';

const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  workspace: 'Çalışma alanı',
  board: 'Pano',
  list: 'Liste',
  card: 'Kart',
  comment: 'Yorum',
  checklist: 'Yapılacaklar',
  attachment: 'Ek dosya',
  other: 'Diğer',
};

const KNOWN_CATEGORIES: readonly ActivityCategory[] = [
  'workspace',
  'board',
  'list',
  'card',
  'comment',
  'checklist',
  'attachment',
];

/** Derive the category from an event `type` such as `card.renamed` → `card`. */
export function activityCategory(type: string): ActivityCategory {
  const prefix = type.split('.')[0] ?? '';
  return (KNOWN_CATEGORIES as readonly string[]).includes(prefix)
    ? (prefix as ActivityCategory)
    : 'other';
}

/** Turkish display label for an event type's category. */
export function activityCategoryLabel(type: string): string {
  return CATEGORY_LABELS[activityCategory(type)];
}

/**
 * A single payload-derived row in the detail modal's "Değişiklikler" section.
 * Web-facing shape (Turkish `label` already resolved); `truncated` is surfaced
 * only when the source field was clipped to the 2KB audit limit.
 */
export type ActivityChange =
  | { kind: 'diff'; label: string; from: string; to: string; truncated?: true }
  | { kind: 'value'; label: string; value: string; truncated?: true };

/** Turkish labels for known field suffixes (`fromTitle`/`toTitle` → "Başlık"). */
const FIELD_LABELS: Record<string, string> = {
  '': 'Değer',
  title: 'Başlık',
  name: 'Ad',
  slug: 'Slug',
  color: 'Renk',
  icon: 'Simge',
  iconcolor: 'Simge rengi',
  background: 'Arka plan',
  position: 'Konum',
  listid: 'Liste',
  list: 'Liste',
  due: 'Son tarih',
  dueat: 'Son tarih',
  description: 'Açıklama',
  content: 'İçerik',
  text: 'Metin',
  role: 'Rol',
};

/** Turkish labels for known standalone scalar keys. */
const VALUE_LABELS: Record<string, string> = {
  title: 'Başlık',
  content: 'İçerik',
  text: 'Metin',
  filename: 'Dosya',
  mimetype: 'Dosya türü',
  sizebytes: 'Boyut',
  role: 'Rol',
  archived: 'Arşiv durumu',
  hasdescription: 'Açıklama',
  email: 'E-posta',
};

/** Insert spaces before capitals and title-case — fallback for unknown keys. */
function humanize(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function fieldLabel(suffix: string): string {
  return FIELD_LABELS[suffix.toLowerCase()] ?? humanize(suffix);
}

function valueLabel(key: string): string {
  return VALUE_LABELS[key.toLowerCase()] ?? humanize(key);
}

/** Format a scalar payload value for display, keyed by its (suffix-)name. */
function formatCell(name: string, raw: unknown): string {
  const lower = name.toLowerCase();
  if (raw == null) return '';
  if (typeof raw === 'boolean') {
    if (lower === 'archived') return raw ? 'Arşivlendi' : 'Geri yüklendi';
    return raw ? 'Evet' : 'Hayır';
  }
  if (typeof raw === 'number') {
    if (lower.includes('size') || lower.includes('bytes')) return formatBytes(raw);
    return String(raw);
  }
  if (typeof raw === 'string') {
    if (lower === 'role') {
      if (raw === 'assignee') return 'Sorumlu';
      if (raw === 'watcher') return 'İzleyen';
    }
    return raw;
  }
  return '';
}

/**
 * Build the structured change list for an activity payload. Thin web wrapper
 * over `@pusula/domain`'s shared `buildActivityChanges`: the pair detection /
 * scalar collection / truncated-flag logic is domain-side; here we inject the
 * Turkish field labels, `formatBytes`, and boolean/role wording. The returned
 * shape is web-facing (`label` resolved, no `field` key) so existing consumers
 * and tests stay unchanged.
 */
export function buildActivityChanges(payload: unknown): ActivityChange[] {
  const changes = buildActivityChangesDomain(payload, {
    fieldLabel,
    valueLabel,
    formatBytes,
    formatCell,
  });

  return changes.map((change) => {
    if (change.kind === 'diff') {
      const row: ActivityChange = {
        kind: 'diff',
        label: change.label,
        from: change.from,
        to: change.to,
      };
      if (change.truncated) row.truncated = true;
      return row;
    }
    const row: ActivityChange = { kind: 'value', label: change.label, value: change.value };
    if (change.truncated) row.truncated = true;
    return row;
  });
}
