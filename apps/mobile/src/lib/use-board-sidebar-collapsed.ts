import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_SIDEBAR_COLLAPSED,
  loadSidebarCollapsed,
  saveSidebarCollapsed,
} from '@/lib/board-sidebar-preference';

type UseBoardSidebarCollapsed = {
  /** Panel daraltıldı mı — tercih yüklenene dek varsayılan (`false` = açık). */
  collapsed: boolean;
  /** Tercih AsyncStorage'dan çözüldü mü (ilk açılışta görsel sıçramayı önlemek için). */
  loaded: boolean;
  /** Daraltma durumunu değiştirir: anında uygular + cihaz-yerel saklar (global tercih). */
  toggle: () => void;
};

/**
 * Board sidebar daraltma durumu (2026-06-19) — açılışta `AsyncStorage`'dan
 * yükler, değişince yazar. `useBoardViewMode` deseni; tercih global (aynı anda
 * tek board ekranı mount olur). Çözülene dek `collapsed=false` (panel açık)
 * gösterilir; `loaded` ile çağıran ilk render animasyonunu bastırabilir.
 */
export function useBoardSidebarCollapsed(): UseBoardSidebarCollapsed {
  const [collapsed, setCollapsed] = useState(DEFAULT_SIDEBAR_COLLAPSED);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void loadSidebarCollapsed().then((stored) => {
      if (active) {
        setCollapsed(stored);
        setLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      void saveSidebarCollapsed(next);
      return next;
    });
  }, []);

  return { collapsed, loaded, toggle };
}
