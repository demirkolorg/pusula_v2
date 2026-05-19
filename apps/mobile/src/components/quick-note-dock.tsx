import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { QuickNoteDockView } from '@/components/quick-note-dock-view';
import { useQuickNoteDraft } from '@/lib/quick-note-draft';

type QuickNoteDockProps = {
  /**
   * Dock'un ölçülen yüksekliği değişince çağrılır — anasayfa kaydırılan
   * içeriğine bu kadar alt boşluk verilir, böylece son satır dock'un arkasında
   * gizli kalmaz (içerik dock'un altından kayar).
   */
  onHeightChange: (height: number) => void;
};

/**
 * Anasayfa hızlı-not dock'u (DEM-230) — veri katmanı.
 *
 * Taslak metni `QuickNoteDraftProvider` context'inden okur/yazar; sunumu
 * `QuickNoteDockView`'e devreder. Kaydetme alt tab bar'daki "+" butonuyla
 * yapılır — bu yüzden dock ekranda odaktayken `setActive(true)` ile "+"
 * butonunu kendine yönlendirir (`useFocusEffect`); başka ekrana geçince "+"
 * normal işine (Hızlı Notlar ekranı) döner.
 */
export function QuickNoteDock({ onHeightChange }: QuickNoteDockProps) {
  const { draft, setDraft, setActive } = useQuickNoteDraft();

  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, [setActive]),
  );

  return (
    <QuickNoteDockView value={draft} onChangeText={setDraft} onHeightChange={onHeightChange} />
  );
}
