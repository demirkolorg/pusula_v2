import { useCallback, useRef } from 'react';
import { Pressable, ScrollView, View, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import type { BoardCard, BoardList } from '@/lib/board-cache';
import { isPendingId } from '@/lib/client-mutation-id';
import { useFloatingNavInset } from '@/lib/use-floating-nav-inset';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

export interface BoardSidebarProps {
  /** Aktif (arşivli olmayan) listeler — parent filtreler. */
  lists: readonly BoardList[];
  /** Kart kümeleri liste id'sine göre — `board.get` `position` sıralı; etiket filtresi parent'ta uygulanır. */
  cardsByList: ReadonlyMap<string, readonly BoardCard[]>;
  /**
   * Kart tap — verilirse master-detail sağ pane'i set'lemek için çağrılır
   * (tablet branch'i — 15C.6'da board ekranı geçer). Verilmezse mevcut
   * full-screen route'a push edilir (`/cards/[cardId]`).
   */
  onSelectCard?: (cardId: string) => void;
  /** Şu an sağ pane'de seçili kart — sidebar'da vurgulanır. */
  selectedCardId?: string | null;
}

/**
 * Faz 15C (DEM-303) — board master-detail sol sidebar'ı.
 *
 * Tablet'te board ekranının sol pane'i: liste başlıkları + her listenin
 * kart başlıkları (Trello/Linear iPad pattern'i). Kart tap'i `onSelectCard`
 * (master-detail) varsa onu çağırır, yoksa `cards/[cardId]` route'una
 * push eder — sidebar phone'da render edilmez ama route fallback uygulama
 * kalan flow'larla simetrik kalır (deep link, smoke).
 *
 * Optimistic (pending) kartlar disabled (henüz yazılmamış); seçili kart
 * `bg-primary/10` vurgusu alır. Liste boşsa "Kart yok" mesajı görünür.
 */
export function BoardSidebar({
  lists,
  cardsByList,
  onSelectCard,
  selectedCardId,
}: BoardSidebarProps) {
  const router = useRouter();
  const theme = themeFor(useColorScheme());
  // Sidebar yalnız tablet'te; alttaki floating pill nav son kartı örtmesin.
  const navInset = useFloatingNavInset();

  // `useRouter` her render'da yeni nesne döndürür — handler'ı stabil tutmak
  // için ref üzerinden okuruz (board ekranı `BoardColumn` `React.memo`
  // pattern'iyle uyumlu).
  const routerRef = useRef(router);
  routerRef.current = router;
  const onSelectCardRef = useRef(onSelectCard);
  onSelectCardRef.current = onSelectCard;

  const handleCardPress = useCallback((cardId: string, title: string) => {
    const next = onSelectCardRef.current;
    if (next) {
      next(cardId);
      return;
    }
    routerRef.current.push({
      pathname: '/cards/[cardId]',
      params: { cardId, title },
    });
  }, []);

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ gap: 12, padding: 12, paddingBottom: navInset || 12 }}
    >
      {lists.map((list) => {
        const cards = cardsByList.get(list.id) ?? [];
        return (
          <View
            key={list.id}
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <View className="flex-row items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <Text
                weight="semibold"
                className="flex-1 text-sm text-foreground"
                numberOfLines={1}
              >
                {list.title}
              </Text>
              <View className="rounded-full bg-muted px-2 py-0.5">
                <Text weight="medium" className="text-xs text-muted-foreground">
                  {cards.length}
                </Text>
              </View>
            </View>
            {cards.length === 0 ? (
              <View className="px-3 py-2.5">
                <Text className="text-xs text-muted-foreground">
                  {strings.board.emptyList}
                </Text>
              </View>
            ) : (
              cards.map((card, index) => {
                const isPending = isPendingId(card.id);
                const isSelected = !isPending && selectedCardId === card.id;
                return (
                  <Pressable
                    key={card.id}
                    disabled={isPending}
                    accessibilityRole="button"
                    accessibilityLabel={card.title}
                    accessibilityState={{
                      selected: isSelected,
                      disabled: isPending,
                    }}
                    onPress={() => handleCardPress(card.id, card.title)}
                    className={`flex-row items-center gap-2 px-3 py-2 active:opacity-60 ${
                      index > 0 ? 'border-t border-border' : ''
                    } ${isSelected ? 'bg-primary/10' : ''}`}
                  >
                    <Text
                      className={`flex-1 text-sm ${
                        card.completed
                          ? 'text-muted-foreground line-through'
                          : 'text-foreground'
                      }`}
                      numberOfLines={1}
                    >
                      {card.title}
                    </Text>
                    {card.completed ? (
                      <Icon name="check-circle" size={14} color={theme.success} />
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
