/**
 * DEM-203 WP5 — son tarih hazır-ayar saf yardımcıları.
 *
 * `DueDatePresetPicker` bileşeninden ayrıştırılmış saf fonksiyonlar — birim
 * testi React/RN bağımlılığı olmadan çalışsın diye buraya çıkarıldı. Bileşen
 * davranışı değişmez; `due-date-preset-picker.tsx` bu modülü tüketir.
 */

/** Hazır-ayar anahtarları — bugün / yarın / hafta sonu / gelecek hafta. */
export type PresetKind = 'today' | 'tomorrow' | 'weekend' | 'nextWeek';

/** Son tarihlerin sabitlendiği saat — `DueDateSheetBody` ile aynı gün-sonu. */
export const DUE_PRESET_HOUR = 18;

/**
 * Bir hazır-ayar anahtarını somut son tarihe çevirir — saat `DUE_PRESET_HOUR`'a
 * sabitlenir (`due-date-sheet.tsx`'teki `presetDate` ile birebir aynı kural).
 *
 * Test edilebilirlik için `now` enjekte edilebilir; verilmezse `new Date()`.
 */
export function presetDate(kind: PresetKind, now: Date = new Date()): Date {
  const date = new Date(now.getTime());
  date.setHours(DUE_PRESET_HOUR, 0, 0, 0);
  if (kind === 'tomorrow') {
    date.setDate(date.getDate() + 1);
  } else if (kind === 'nextWeek') {
    date.setDate(date.getDate() + 7);
  } else if (kind === 'weekend') {
    // Bir sonraki cumartesi; bugün cumartesiyse gelecek cumartesi.
    const offset = (6 - date.getDay() + 7) % 7 || 7;
    date.setDate(date.getDate() + offset);
  }
  return date;
}

/** İki tarih aynı gün mü — seçili hazır-ayar çipini vurgulamak için. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
