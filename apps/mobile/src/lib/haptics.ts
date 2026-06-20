/**
 * Haptik geri bildirim (2026-06-20) — ince dokunsal yanıtlar. `expo-haptics`
 * üstüne sade bir sarmalayıcı: çağrı noktaları stil yerine ANLAM adıyla okunur
 * (`hapticSuccess` vs ham `notificationAsync`). Tüm çağrılar "fire-and-forget":
 * Promise await edilmez, native köprü yoksa/başarısızsa sessizce yutulur —
 * haptik kritik değildir, hiçbir zaman akışı bloklamaz veya hata fırlatmaz.
 *
 * Aşırı titreşim rahatsız eder; yalnız dokunsal yanıtın BEKLENDİĞİ anlarda
 * çağır (tamamlama, taşıma onayı, swipe aksiyonu). Sıradan her dokunuşa ekleme.
 */
import * as Haptics from 'expo-haptics';

function run(fn: () => Promise<unknown>): void {
  void fn().catch(() => {});
}

/** Hafif darbe — satır/swipe aksiyonu gibi nazik, sık etkileşim onayı. */
export function hapticLight(): void {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Orta darbe — uzun basma tetiklendi / taşıma gibi etkili, kasıtlı eylemler. */
export function hapticMedium(): void {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Başarı bildirimi — tamamlama / kaydetme gibi olumlu sonuçlar. */
export function hapticSuccess(): void {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Seçim değişimi — segment/picker üzerinde kayarken ince tık. */
export function hapticSelection(): void {
  run(() => Haptics.selectionAsync());
}
