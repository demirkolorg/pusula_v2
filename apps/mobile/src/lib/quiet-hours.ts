/**
 * Sessiz saatler yardımcıları (Faz 7K) — bildirim ayar ekranı "Sessiz saatler"
 * bölümünün saf doğrulama/varsayılan parçaları.
 *
 * Backend `@pusula/domain` `quietHourTimeSchema` (`HH:MM` regex) +
 * `ianaTimezoneSchema` doğrular; bu modül istemci tarafı erken doğrulama ve
 * varsayılan üretimi için. Tam takvim/picker yerine pragmatik metin girişi
 * (kullanıcı kararı: yeni native dep ekleme).
 *
 * Saf modül — RN/Expo importu yok; birim test edilir.
 */

/** `HH:MM` (24 saat) biçimi — `@pusula/domain` `quietHourTimeSchema` ile aynı. */
const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Varsayılan sessiz saat penceresi — 23:00'dan 07:00'a. */
export const QUIET_HOURS_DEFAULT_FROM = '23:00';
export const QUIET_HOURS_DEFAULT_TO = '07:00';
/** Varsayılan zaman dilimi — Türkiye odaklı; backend tüm IANA id'lerini kabul eder. */
export const QUIET_HOURS_DEFAULT_TIMEZONE = 'Europe/Istanbul';

/** Bir string `HH:MM` biçiminde geçerli bir saat mi. */
export function isValidQuietTime(value: string): boolean {
  return HHMM_REGEX.test(value);
}

/**
 * Bir tercih satırının sessiz saat penceresi tanımlı mı (üçü de dolu). Web
 * `notifications-quiet-hours-form.tsx` `hasWindow` ile aynı kural.
 */
export function hasQuietWindow(pref: {
  quietFrom: string | null;
  quietTo: string | null;
  quietTimezone: string | null;
}): boolean {
  return (
    pref.quietFrom !== null && pref.quietTo !== null && pref.quietTimezone !== null
  );
}

/**
 * Quiet-hours formuna girilen bir taslağı backend'e gönderilmeye hazır
 * duruma getirir / hatayı raporlar.
 *
 * - Pencere kapalıysa (`enabled: false`) üçlü `null` döner — geçerli.
 * - Açıkken `from`/`to` `HH:MM` olmalı ve birbirinden farklı olmalı (aynı
 *   saat sıfır-uzunluklu pencere). Aksi halde `error` döner.
 */
export type QuietHoursDraft = {
  enabled: boolean;
  from: string;
  to: string;
  timezone: string;
};

export type QuietHoursResult =
  | { ok: true; quietFrom: string | null; quietTo: string | null; quietTimezone: string | null }
  | { ok: false; error: 'invalidTime' | 'invalidWindow' };

/** Bir quiet-hours taslağını doğrular ve upsert'e gidecek üçlüye çevirir. */
export function resolveQuietHours(draft: QuietHoursDraft): QuietHoursResult {
  if (!draft.enabled) {
    return { ok: true, quietFrom: null, quietTo: null, quietTimezone: null };
  }
  if (!isValidQuietTime(draft.from) || !isValidQuietTime(draft.to)) {
    return { ok: false, error: 'invalidTime' };
  }
  if (draft.from === draft.to) {
    return { ok: false, error: 'invalidWindow' };
  }
  return {
    ok: true,
    quietFrom: draft.from,
    quietTo: draft.to,
    quietTimezone: draft.timezone,
  };
}
