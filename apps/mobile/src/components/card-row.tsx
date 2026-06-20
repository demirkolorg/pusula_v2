import { memo, useCallback } from 'react';
import { useRouter } from 'expo-router';
import type { RouterOutputs } from '@pusula/api';
import { CardFace } from '@/components/card-face';
import { isPendingId } from '@/lib/client-mutation-id';
import { hapticMedium } from '@/lib/haptics';

type BoardCard = RouterOutputs['board']['get']['cards'][number];

/**
 * Tek kart satırı — `FlatList` / `SectionList` `renderItem` için ayrı
 * `React.memo`'lu bileşen (DEM-226). Kanban kolonu (`board-column.tsx`) ve
 * dikey liste görünümü (`board-list-view.tsx`) bunu ortak tüketir — DEM-233'te
 * `board-column.tsx`'ten buraya çıkarıldı.
 *
 * `onPress`/`onLongPress` satır içinde `useCallback` ile stabilize edilir,
 * böylece `card` referansı değişmeyen satırların `CardFace`'i yeniden render
 * edilmez. `router` satır içinde alınır — `useRouter` her render'da yeni nesne
 * döndürdüğünden prop olarak geçmek memo'yu kırardı.
 */
export const CardRow = memo(function CardRow({
  card,
  canEdit,
  onMoveCard,
}: {
  card: BoardCard;
  canEdit: boolean;
  onMoveCard: (card: BoardCard) => void;
}) {
  const router = useRouter();
  // Optimistic kart sunucudan dönene kadar etkileşime kapalı — `tmp-` id ile
  // kart detayı / taşıma backend'de bulunamaz.
  const cardPending = isPendingId(card.id);

  const handlePress = useCallback(() => {
    router.push({
      pathname: '/cards/[cardId]',
      params: { cardId: card.id, title: card.title },
    });
  }, [router, card.id, card.title]);

  // Uzun basma taşıma picker'ını açar — orta darbe ile tetiklendiğini onayla.
  const handleLongPress = useCallback(() => {
    hapticMedium();
    onMoveCard(card);
  }, [onMoveCard, card]);

  return (
    <CardFace
      card={card}
      onPress={cardPending ? undefined : handlePress}
      onLongPress={canEdit && !cardPending ? handleLongPress : undefined}
    />
  );
});
