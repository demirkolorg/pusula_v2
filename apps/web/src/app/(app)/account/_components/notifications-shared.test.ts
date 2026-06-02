import { describe, expect, it } from 'vitest';
import {
  MATRIX_ROWS,
  NOTIFICATION_CHANNEL_KEYS,
  PREFERENCE_DEFAULTS,
  type ChannelCellState,
  type MatrixRow,
  type NotificationChannelKey,
} from './notifications-shared';

/**
 * MATRIX_ROWS, `packages/api/src/lib/notification-rules.ts:pickChannels`
 * fonksiyonunun statik tablosudur. Bu testler iki tarafın senkron kalmasını
 * sağlar — yeni bir bildirim tipi eklendiğinde matrix güncellenmezse fail.
 */

const MUTE_BYPASS_TYPES = new Set(['mention', 'board_invitation', 'workspace_invitation']);
// 2026-06-01 push expansion — `pickChannels` push'u tüm tipler için `pushEnabled`
// kapısına bağlar (önceki 5-tip alt-küme kaldırıldı). UI matris her push hücresini
// `'on'` (toggle açık, kullanıcı `push_enabled=false` ile opt-out edebilir) olarak
// gösterir; push'ta mute-bypass yok. Detay → `docs/domain/04-bildirim-kurallari.md`
// "Push kanalı kapsamı".
const EMAIL_TYPES = new Set([
  'card_assigned',
  'mention',
  'due_overdue',
  'board_invitation',
  'workspace_invitation',
  'member_removed',
  // DEM-175 — board'a doğrudan eklenme e-posta opt-in (mute-bypass değil).
  'board_member_added',
  // DEM-154 — board erişim talebi e-posta opt-in (admin posta kutusunda görsün).
  'board_access_requested',
]);

describe('notifications-shared MATRIX_ROWS', () => {
  it('mirrors notification-rules pickChannels for in_app channel', () => {
    for (const row of MATRIX_ROWS) {
      const expected: ChannelCellState = MUTE_BYPASS_TYPES.has(row.type) ? 'mute_bypass' : 'on';
      expect(row.channels.in_app, row.type).toBe(expected);
    }
  });

  it('mirrors notification-rules pickChannels for email channel', () => {
    for (const row of MATRIX_ROWS) {
      const isMuteBypass = MUTE_BYPASS_TYPES.has(row.type);
      const expected: ChannelCellState = isMuteBypass
        ? 'mute_bypass'
        : EMAIL_TYPES.has(row.type)
          ? 'on'
          : 'unavailable';
      expect(row.channels.email, row.type).toBe(expected);
    }
  });

  it('mirrors notification-rules pickChannels for push channel (2026-06-01 expansion)', () => {
    for (const row of MATRIX_ROWS) {
      // 2026-06-01 push expansion — `pickChannels` push'u tüm tipler için
      // `pushEnabled` gate'ine bağlar; push'ta mute-bypass yok. Her satır
      // `'on'` (kullanıcı `push_enabled=false` ile opt-out edebilir).
      expect(row.channels.push, row.type).toBe('on');
    }
  });

  it('exposes 42 rows (one per produced NotificationType)', () => {
    // DEM-152 — 11 → 17: `watched_activity` çıkarıldı (artık üretilmiyor,
    // enum'da fallback), 7 granular kart-aktivite tipi eklendi.
    // DEM-153 — 17 → 27: kartla ilgili kalan 10 granular aksiyon tipi eklendi
    // (başlık/açıklama/etiket/yorum düzenle-sil/checklist/ek kaldırma).
    // DEM-175 — 27 → 28: `board_member_added` (doğrudan board ekleme).
    // DEM-213 — 28 → 29: `board_access_requested` (board erişim talebi).
    // Bildirim kapsamı genişletme — Faz 2 (2026-06-03) — 29 → 42: kart oluşturma
    // + liste yaşam döngüsü (5) + board yaşam döngüsü (4) + etiket CRUD (3) =
    // 13 yeni granular tip (hepsi in-app + push, email opt-in DEĞİL).
    expect(MATRIX_ROWS).toHaveLength(42);
  });

  it('every row carries a valid group + i18nKey + channel state set', () => {
    const channelKeys: NotificationChannelKey[] = [...NOTIFICATION_CHANNEL_KEYS];
    for (const row of MATRIX_ROWS as readonly MatrixRow[]) {
      for (const channel of channelKeys) {
        expect(row.channels[channel]).toMatch(/^(on|mute_bypass|unavailable)$/);
      }
      expect(row.i18nKey).toMatch(/^[a-z][A-Za-z]+$/);
    }
  });
});

describe('PREFERENCE_DEFAULTS', () => {
  it('matches the rule-engine fallback defaults', () => {
    expect(PREFERENCE_DEFAULTS).toEqual({
      muteLevel: 'none',
      mentionOnly: false,
      pushEnabled: true,
      emailEnabled: true,
      // Faz 10F (DEM-140) — quiet-hours triplet boş = pencere kapalı.
      quietFrom: null,
      quietTo: null,
      quietTimezone: null,
      // Faz 10H (DEM-142) — snooze yok.
      muteUntil: null,
      // Faz 10G (DEM-141) — DB default `'instant'`.
      emailMode: 'instant',
    });
  });
});
