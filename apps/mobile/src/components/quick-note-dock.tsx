import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { QuickNoteDockView } from '@/components/quick-note-dock-view';
import { useQuickNoteDraft } from '@/lib/quick-note-draft';


/**
 * Anasayfa hızlı-not dock'u (DEM-230) — veri katmanı.
 *
 * Taslak metni `QuickNoteDraftProvider` context'inden okur/yazar; sunumu
 * `QuickNoteDockView`'e devreder. İki gönderim yolu:
 * - **Dock-içi send butonu** (DEM-236 2. tur, 2026-05-21) — klavye accessory
 *   gibi çalışır; klavye açıkken erişilebilir (`tabBarHideOnKeyboard:true`
 *   ile çelişmez). Birincil yol.
 * - **Tab bar "+" butonu** (`CreateTabButton`) — klavye kapalıyken; `setActive`
 *   ile dock odaktayken "+"yu kendine yönlendirir (`useFocusEffect`); başka
 *   ekrana geçince "+" normal işine (Hızlı Notlar ekranı) döner.
 */
export function QuickNoteDock() {
  const { draft, setDraft, setActive, submit } = useQuickNoteDraft();

  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, [setActive]),
  );

  return (
    <QuickNoteDockView
      value={draft}
      onChangeText={setDraft}
      onSubmit={submit}
      canSubmit={draft.trim().length > 0}
    />
  );
}
