import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_BOARD_VIEW_MODE,
  loadBoardViewMode,
  saveBoardViewMode,
  type BoardViewMode,
} from '@/lib/board-view-preference';

type UseBoardViewMode = {
  /** Aktif görünüm modu — tercih yüklenene dek varsayılan (`kanban`). */
  mode: BoardViewMode;
  /** Modu değiştirir: anında uygular + cihaz-yerel saklar (global tercih). */
  setMode: (mode: BoardViewMode) => void;
};

/**
 * Board görünüm modu (DEM-233) — kanban / liste. Açılışta `AsyncStorage`'dan
 * yükler, değişince yazar. Tercih global: anahtar board'a bağlı değil, her
 * board ekranı aynı değeri okur (`theme-preference` deseni — burada context
 * gerekmez, aynı anda tek board ekranı mount olur). Yükleme async; çözülene dek
 * `kanban` gösterilir — mevcut varsayılan görünüm olduğundan görünür bir
 * sıçrama olmaz.
 */
export function useBoardViewMode(): UseBoardViewMode {
  const [mode, setModeState] = useState<BoardViewMode>(DEFAULT_BOARD_VIEW_MODE);

  useEffect(() => {
    let active = true;
    void loadBoardViewMode().then((stored) => {
      if (active) setModeState(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: BoardViewMode) => {
    setModeState(next);
    void saveBoardViewMode(next);
  }, []);

  return { mode, setMode };
}
