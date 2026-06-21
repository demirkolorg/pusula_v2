import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_CARD_COVER_VIEW,
  loadCardCoverView,
  saveCardCoverView,
  type CardCoverView,
} from '@/lib/card-cover-view-preference';

type UseCardCoverView = {
  /** Aktif görünüm modu — tercih yüklenene dek varsayılan (`fit`). */
  view: CardCoverView;
  /** Modu fit↔banner çevirir: anında uygular + cihaz-yerel saklar (kart bazlı). */
  toggle: () => void;
};

/**
 * Kart kapak görünüm modu (mobil — web kart modalı çift-tık paritesi). Açılışta
 * kartın `AsyncStorage` tercihini yükler, değişince yazar. Tercih kart bazlı:
 * anahtar kart id'si içerir (`card-cover-view-preference` deseni —
 * `use-board-view-mode` hook'unun kart-bazlı karşılığı). Yükleme async; çözülene
 * dek `fit` gösterilir — web varsayılanıyla aynı olduğundan görünür sıçrama
 * olmaz.
 */
export function useCardCoverView(cardId: string): UseCardCoverView {
  const [view, setView] = useState<CardCoverView>(DEFAULT_CARD_COVER_VIEW);

  useEffect(() => {
    let active = true;
    void loadCardCoverView(cardId).then((stored) => {
      if (active) setView(stored);
    });
    return () => {
      active = false;
    };
  }, [cardId]);

  const toggle = useCallback(() => {
    setView((prev) => {
      const next: CardCoverView = prev === 'fit' ? 'banner' : 'fit';
      void saveCardCoverView(cardId, next);
      return next;
    });
  }, [cardId]);

  return { view, toggle };
}
