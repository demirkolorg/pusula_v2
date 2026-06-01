'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * Sol global panel id'lerinin kanonik tipi. `AppShell` state'i + `LeftRail`
 * rail butonları + `LeftPanelContext` tüketicileri buradan import eder; tek
 * tanım — drift yok (önceki kopyalar 2026-06-01'de temizlendi).
 *
 * Tek panel ilkesi: aynı anda yalnız 1 panel açık olabilir; aynı butona
 * tekrar basmak aktif paneli kapatır.
 */
export type LeftPanelId =
  | 'navigator'
  | 'quickNotes'
  | 'planner'
  | 'myTasks'
  | 'activityFeed'
  | 'whatsNew';

/**
 * `LeftRail` rail butonlarının çıkış sırası + storage migration önceliği için
 * sabit liste. Yeni panel sona eklenir (kullanıcı muscle memory korunur).
 */
export const LEFT_PANEL_IDS: readonly LeftPanelId[] = [
  'navigator',
  'quickNotes',
  'planner',
  'myTasks',
  'activityFeed',
  'whatsNew',
] as const;

export function isLeftPanelId(value: string | null): value is LeftPanelId {
  return value !== null && (LEFT_PANEL_IDS as readonly string[]).includes(value);
}

/**
 * `AppShell`'in dışından (örn. anasayfa HomeHero pill'i) bir sol paneli
 * açmak için kullanılan context. `AppShell` provider olur; tüketiciler
 * `useLeftPanel()` ile `openPanel(id)` çağırır.
 *
 * Provider olmadan çağrılırsa no-op (test/storybook senaryolarında crash
 * yerine sessiz davranır) — gerçek davranış yalnız `AppShell` altında.
 */
type LeftPanelContextValue = {
  /**
   * Belirtilen paneli aç. Halihazırda başka panel açıksa onu kapatır (tek
   * panel ilkesi `AppShell` `togglePanel` ile uyumlu — açık olan id ile
   * aynı id gelirse de aynı tick'te ona düşülür, ama bu helper "kapatma"
   * değil "açma" semantiği taşır; aynı paneli "yeniden aç"mak no-op olur).
   */
  openPanel: (id: LeftPanelId) => void;
};

const LeftPanelContext = createContext<LeftPanelContextValue | null>(null);

export function LeftPanelProvider({
  openPanel,
  children,
}: {
  openPanel: (id: LeftPanelId) => void;
  children: ReactNode;
}) {
  // `openPanel` referansı `AppShell` tarafında `useCallback` ile sabitlenir;
  // burada `useMemo` ile context value'yu da sabitliyoruz ki tüketici
  // componentler gereksiz re-render almasın.
  const value = useMemo<LeftPanelContextValue>(() => ({ openPanel }), [openPanel]);
  return <LeftPanelContext.Provider value={value}>{children}</LeftPanelContext.Provider>;
}

export function useLeftPanel(): LeftPanelContextValue {
  const ctx = useContext(LeftPanelContext);
  // Provider yoksa no-op — `AppShell` dışında render edilen ekranlar
  // (sign-in/up vb.) crash etmesin.
  return ctx ?? { openPanel: () => {} };
}
