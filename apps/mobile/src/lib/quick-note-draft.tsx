import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuickNoteMutations } from '@/lib/use-quick-note-mutations';

/**
 * Anasayfa hızlı-not dock'u (DEM-230) ile alt tab bar'daki merkezi "+" butonu
 * arasındaki paylaşılan taslak state'i.
 *
 * Dock ekranın altındaki tek satır metin alanıdır; "+" butonu (tab bar'da, ayrı
 * bir ağaç dalında) dock odaktayken o taslağı kaydeder. İkisi bu context ile
 * haberleşir:
 * - `draft` / `setDraft` — dock'un `TextInput`'una bağlı metin.
 * - `submit` — taslağı (trim'lenmiş, boş değilse) hızlı nota dönüştürür + temizler.
 * - `active` — dock o an ekranda odakta mı; "+" butonunun davranışını belirler
 *   (dock `useFocusEffect` ile bu bayrağı sürer).
 *
 * Provider `useQuickNoteMutations`'ı tüketir → `AppProviders` (trpc + query)
 * altında, `<Tabs>`'i saracak şekilde mount edilir.
 */
type QuickNoteDraftValue = {
  draft: string;
  setDraft: (text: string) => void;
  /** Taslağı (trim'lenmiş, boş değilse) hızlı nota dönüştürür ve temizler. */
  submit: () => void;
  /** Hızlı-not dock'u o an ekranda odakta mı — tab "+" davranışını belirler. */
  active: boolean;
  setActive: (active: boolean) => void;
};

const QuickNoteDraftContext = createContext<QuickNoteDraftValue | null>(null);

export function QuickNoteDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState('');
  const [active, setActive] = useState(false);
  const { createNote } = useQuickNoteMutations();

  const submit = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    createNote(trimmed);
    setDraft('');
  }, [draft, createNote]);

  const value = useMemo<QuickNoteDraftValue>(
    () => ({ draft, setDraft, submit, active, setActive }),
    [draft, submit, active],
  );

  return <QuickNoteDraftContext.Provider value={value}>{children}</QuickNoteDraftContext.Provider>;
}

/** Hızlı-not taslak context'ine erişir — `QuickNoteDraftProvider` içinde olmalı. */
export function useQuickNoteDraft(): QuickNoteDraftValue {
  const value = useContext(QuickNoteDraftContext);
  if (!value) {
    throw new Error('useQuickNoteDraft yalnız QuickNoteDraftProvider içinde kullanılabilir.');
  }
  return value;
}
