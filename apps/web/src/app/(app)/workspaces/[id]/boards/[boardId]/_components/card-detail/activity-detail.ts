/**
 * Pure helpers for the activity detail modal: turn an `activity_events` row's
 * `type` + `payload` into a category and a structured before/after change list.
 * No React / tRPC so it can be unit-tested in isolation (mirrors the sibling
 * `activity-summary.ts`). Payload shapes follow what the routers write
 * (`packages/api/src/routers/*`); unrecognised keys still surface generically
 * so the detail view stays self-contained for any event type.
 */

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

/** A single payload-derived row in the detail modal's "Değişiklikler" section. */
export type ActivityChange =
  | { kind: 'diff'; label: string; from: string; to: string }
  | { kind: 'value'; label: string; value: string };

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

/** Keys that hold opaque identifiers — surfaced only in the raw payload view. */
function isIdLike(key: string): boolean {
  const lower = key.toLowerCase();
  return lower === 'id' || lower.endsWith('id');
}

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

type DetectedPair = { fromKey: string; toKey: string; suffix: string };

/** Detect a `from*`/`to*` or `old*`/`new*` counterpart for a payload key. */
function detectPair(key: string, entries: Record<string, unknown>): DetectedPair | null {
  if (key.startsWith('from')) {
    const suffix = key.slice(4);
    const toKey = `to${suffix}`;
    if (toKey in entries) return { fromKey: key, toKey, suffix };
  }
  if (key.startsWith('old')) {
    const suffix = key.slice(3);
    const newKey = `new${suffix}`;
    if (newKey in entries) return { fromKey: key, toKey: newKey, suffix };
  }
  return null;
}

/**
 * Build the structured change list for an activity payload. Pairs (`from`/`to`,
 * `old`/`new`) become `diff` rows; remaining non-identifier scalars become
 * `value` rows. Anything that is not a plain object yields an empty list.
 */
export function buildActivityChanges(payload: unknown): ActivityChange[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const entries = payload as Record<string, unknown>;
  const consumed = new Set<string>();
  const changes: ActivityChange[] = [];

  for (const key of Object.keys(entries)) {
    if (consumed.has(key)) continue;
    const pair = detectPair(key, entries);
    if (!pair) continue;
    consumed.add(pair.fromKey);
    consumed.add(pair.toKey);
    changes.push({
      kind: 'diff',
      label: fieldLabel(pair.suffix),
      from: formatCell(pair.suffix, entries[pair.fromKey]),
      to: formatCell(pair.suffix, entries[pair.toKey]),
    });
  }

  for (const key of Object.keys(entries)) {
    if (consumed.has(key) || isIdLike(key)) continue;
    const raw = entries[key];
    if (raw == null || typeof raw === 'object') continue;
    const value = formatCell(key, raw);
    if (value === '') continue;
    changes.push({ kind: 'value', label: valueLabel(key), value });
  }

  return changes;
}
