import { memo, useCallback, useState } from 'react';
import type { ListRenderItem } from 'react-native';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import type { RouterOutputs } from '@pusula/api';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { InlineComposer } from '@/components/inline-composer';
import { isPendingId } from '@/lib/client-mutation-id';
import { asListIcon, featherForListIcon, listColorHex, listIconColorToHex } from '@/lib/list-icon';
import { strings } from '@/lib/strings';
import { useDeviceClass, useIsLandscape } from '@/lib/use-device-class';
import { useFloatingNavInset } from '@/lib/use-floating-nav-inset';
import { useTheme } from '@/theme/theme-provider';
import { CardRow } from './card-row';

type BoardData = RouterOutputs['board']['get'];
type BoardList = BoardData['lists'][number];
type BoardCard = BoardData['cards'][number];

type BoardColumnProps = {
  list: BoardList;
  /** Bu listeye ait kartlar — `position` sıralı (board.get sözleşmesi). */
  cards: BoardCard[];
  /** Board `member+` ise düzenleme yüzeyleri (composer / ⋮ / taşıma) gösterilir. */
  canEdit: boolean;
  /**
   * Kolon altındaki composer'dan kart oluşturma (Faz 7H). `listId` argümanla
   * geçer — böylece çağıran tek bir stabil callback verir (DEM-226 #3).
   */
  onCreateCard: (listId: string, title: string) => void;
  /** Kolon ⋮ — liste işlemleri sheet'ini açar (hedef liste argümanla). */
  onOpenListActions: (list: BoardList) => void;
  /** Kart uzun basma — "move to list" picker'ını açar. */
  onMoveCard: (card: BoardCard) => void;
  /** `board.get` yeniden çekiliyor mu — kolon `RefreshControl` spinner'ı (Faz 7M). */
  refreshing: boolean;
  /** Pull-to-refresh — board verisini yeniden çeker (Faz 7M). */
  onRefresh: () => void;
};

/**
 * Board ekranında tek bir liste kolonu — başlık + kart sayısı + dikey kaydıran
 * kart listesi. Genişlik sabit; yükseklik kapsayıcı yatay scroll'u doldurur.
 * Faz 7H: board `member+` için kolon ⋮ menüsü + kart-ekle composer'ı + kart
 * uzun basma taşıma. `viewer` için kolon salt-okunur kalır (7E davranışı).
 *
 * Faz 7M: kart `FlatList`'i pull-to-refresh taşır — board ekranının dış scroll'u
 * yatay olduğundan (`RefreshControl` yatay scroll'da çalışmaz) yenileme jesti
 * dikey kolon listelerine konur; herhangi bir kolonu aşağı çekmek `board.get`'i
 * tazeler (7.0 kararı: mobilde realtime yok, yenileme elle tetiklenir).
 */
function BoardColumnImpl({
  list,
  cards,
  canEdit,
  onCreateCard,
  onOpenListActions,
  onMoveCard,
  refreshing,
  onRefresh,
}: BoardColumnProps) {
  const theme = useTheme();
  const [composerOpen, setComposerOpen] = useState(false);
  // Optimistic (henüz sunucuya yazılmamış) liste — ⋮ menüsü açılmaz.
  const listPending = isPendingId(list.id);
  // Faz 15B (DEM-302) — kolon genişliği cihaz/yönelime göre: phone 288px,
  // tablet portrait 320px, tablet landscape 384px. NativeWind v4 orientation
  // media query'sini RN runtime'da değerlendirmediği için hook fallback
  // (spec §13.12.7 disiplini).
  const isTablet = useDeviceClass() === 'tablet';
  const isLandscape = useIsLandscape();
  const widthClass = isTablet ? (isLandscape ? 'w-96' : 'w-80') : 'w-72';
  // Tablet floating pill nav son kartı örtmesin → kolon listesine alt boşluk.
  const navInset = useFloatingNavInset();

  // Composer / ⋮ callback'leri — `list.id` sabit kaldığı sürece stabil
  // (DEM-226 #3): `FlatList renderItem` ve alt bileşenler bunlara bağlı.
  const handleCreateCard = useCallback(
    (title: string) => onCreateCard(list.id, title),
    [onCreateCard, list.id],
  );
  const handleOpenListActions = useCallback(
    () => onOpenListActions(list),
    [onOpenListActions, list],
  );

  // Kart satırı render'ı — `useCallback` ile stabil; `CardRow` `React.memo`'lu
  // olduğundan kart prop'u değişmeyen satırlar yeniden çizilmez (DEM-226 #2/#3).
  const renderItem = useCallback<ListRenderItem<BoardCard>>(
    ({ item }) => <CardRow card={item} canEdit={canEdit} onMoveCard={onMoveCard} />,
    [canEdit, onMoveCard],
  );

  // Liste görsel kimliği (DEM-209). Web kolonu tüm arka planı renge boyar;
  // mobilde precedent = ince renk şeridi (DEM-201 kart kapak şeridi gibi).
  // `null` token → nötr görünüm korunur (regresyon yok).
  const accentHex = listColorHex(list.color);
  const listIcon = asListIcon(list.icon);
  // İkon rengi: `iconColor` set ise palet hex'i, değilse nötr (mutedForeground).
  const iconHex = listIconColorToHex(list.iconColor) ?? theme.mutedForeground;

  // Kart ekle tetikleyicisi liste header'ına alındı (2026-06-20); burada yalnız
  // AÇIK composer kartların üstünde render edilir. Kapalıyken yer kaplamaz —
  // tetikleyici header'daki "+" butonu (önceki tam-genişlik satır kaldırıldı).
  const composerRow =
    canEdit && composerOpen ? (
      <InlineComposer
        placeholder={strings.board.addCardPlaceholder}
        submitLabel={strings.board.addCardSubmit}
        onSubmit={handleCreateCard}
        onCancel={() => setComposerOpen(false)}
      />
    ) : null;

  return (
    <View className={`h-full ${widthClass} overflow-hidden rounded-xl bg-muted`}>
      {/* Liste rengi şeridi — kolonun üstünde, kenara dayalı ince renk bandı
          (DEM-209). Renk `null` ise şerit çizilmez; kolon nötr kalır. */}
      {accentHex != null ? (
        <View className="h-1.5" style={{ backgroundColor: accentHex }} />
      ) : null}
      <View className="flex-1 p-2">
        <View className="flex-row items-center gap-2 px-1 py-2">
          {/* Liste ikonu — `icon` token'ı geçerliyse başlığın önünde çizilir
              (DEM-209). Bilinmeyen / `null` token → ikon çizilmez. */}
          {listIcon != null ? (
            <Icon name={featherForListIcon(listIcon)} size={15} color={iconHex} />
          ) : null}
          {/* `shrink` (flex-1 değil): uzun başlık kısalır ama sayıyı sağa itmez. */}
          <Text weight="semibold" className="shrink text-sm text-foreground" numberOfLines={1}>
            {list.title}
          </Text>
          {/* Kart sayısı başlığın HEMEN ardında (2026-06-20) — sağa yaslı değil. */}
          <Text className="text-xs text-muted-foreground">{cards.length}</Text>
          {/* Boşluk: aksiyon butonlarını sağa yaslar (sayı solda kalır). */}
          <View className="flex-1" />
          {/* Aksiyon butonları (2026-06-20) — dokunmatik için ferah aralık
              (`gap-4` = 16px, hitSlop'lar çakışmasın) + büyük dokunma alanı
              (`p-1` + `hitSlop`). `+` composer'ı açar, `⋮` liste menüsü. */}
          {canEdit && !listPending ? (
            <View className="flex-row items-center gap-4">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={strings.board.addCard}
                hitSlop={8}
                onPress={() => setComposerOpen(true)}
                className="p-1 active:opacity-60"
              >
                <Icon name="plus" size={18} color={theme.mutedForeground} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={strings.board.listActions}
                hitSlop={8}
                onPress={handleOpenListActions}
                className="p-1 active:opacity-60"
              >
                <Icon name="more-vertical" size={18} color={theme.mutedForeground} />
              </Pressable>
            </View>
          ) : null}
        </View>
        <FlatList
          data={cards}
          keyExtractor={(card) => card.id}
          // gap + alt boşluk tek `contentContainerStyle`'da (NativeWind className +
          // ayrı style çakışmasını önlemek için). `navInset` tablet'te pill'i temizler;
          // phone'da 0 → taban `pb-2` (8) korunur.
          contentContainerStyle={{ gap: 8, paddingBottom: navInset || 8 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.mutedForeground}
            />
          }
          renderItem={renderItem}
          // Açık composer kartların üstünde (2026-06-20) — tetikleyici header'da.
          // İçerik kapsayıcısının `gap-2`'si composer ile ilk kart arası boşluğu verir.
          ListHeaderComponent={composerRow}
          ListEmptyComponent={
            <Text className="px-1 py-3 text-xs text-muted-foreground">
              {strings.board.emptyList}
            </Text>
          }
          showsVerticalScrollIndicator={false}
        />
      </View>
    </View>
  );
}

/**
 * Board kolonu — `React.memo` ile sarılı (DEM-226 #2). Çağıran kart map'inden
 * stabil `cards` referansı ve `useCallback`'li handler'lar geçirdiğinde,
 * dokunulmayan kolonlar her board render'ında yeniden çizilmez.
 */
export const BoardColumn = memo(BoardColumnImpl);
