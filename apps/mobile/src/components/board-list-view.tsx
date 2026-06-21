import { memo, useCallback, useMemo, useState } from 'react';
import type { SectionListData, SectionListRenderItem } from 'react-native';
import { Pressable, RefreshControl, SectionList, View } from 'react-native';
import type { RouterOutputs } from '@pusula/api';
import { CardListRow } from '@/components/card-list-row';
import { Icon } from '@/components/icon';
import { InlineComposer } from '@/components/inline-composer';
import { Text } from '@/components/text';
import { isPendingId } from '@/lib/client-mutation-id';
import { useFloatingNavInset } from '@/lib/use-floating-nav-inset';
import { asListIcon, featherForListIcon, listColorHex, listIconColorToHex } from '@/lib/list-icon';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

type BoardData = RouterOutputs['board']['get'];
type BoardList = BoardData['lists'][number];
type BoardCard = BoardData['cards'][number];

/** `SectionList` section — bir liste + o listenin kartları (`position` sıralı). */
type BoardSection = { key: string; list: BoardList; data: BoardCard[] };

type BoardListViewProps = {
  /** Aktif (arşivsiz) listeler — `position` sıralı. */
  lists: BoardList[];
  /** Kartlar liste başına gruplu + etiket filtresinden geçmiş (board ekranı üretir). */
  cardsByList: Map<string, BoardCard[]>;
  /** Board `member+` ise düzenleme yüzeyleri (composer / ⋮) gösterilir. */
  canEdit: boolean;
  /** Section footer composer'ından kart oluşturma — `listId` argümanla geçer. */
  onCreateCard: (listId: string, title: string) => void;
  /** Liste footer'ından yeni liste oluşturma. */
  onCreateList: (title: string) => void;
  /** Section başlığı ⋮ — liste işlemleri sheet'ini açar. */
  onOpenListActions: (list: BoardList) => void;
  /** Kart uzun basma — "move to list" picker'ını açar. */
  onMoveCard: (card: BoardCard) => void;
  /** `board.get` yeniden çekiliyor mu — pull-to-refresh spinner'ı. */
  refreshing: boolean;
  /** Pull-to-refresh — board verisini yeniden çeker. */
  onRefresh: () => void;
};

/** Kartsız section'lar için stabil boş dizi referansı. */
const EMPTY_CARDS: BoardCard[] = [];

/**
 * Section başlığı — liste rengi şeridi + ikon + ad + kart sayısı + (member+ ise)
 * ⋮ menüsü. Kanban kolon başlığının (`board-column.tsx`) dikey-liste karşılığı;
 * `React.memo` ile dokunulmayan section'lar yeniden çizilmez (DEM-226 deseni).
 */
const ListSectionHeader = memo(function ListSectionHeader({
  list,
  count,
  canEdit,
  onOpenListActions,
}: {
  list: BoardList;
  count: number;
  canEdit: boolean;
  onOpenListActions: (list: BoardList) => void;
}) {
  const theme = useTheme();
  // Optimistic (henüz sunucuya yazılmamış) liste — ⋮ menüsü açılmaz.
  const listPending = isPendingId(list.id);
  const accentHex = listColorHex(list.color);
  const listIcon = asListIcon(list.icon);
  // İkon rengi: `iconColor` set ise palet hex'i, değilse nötr (mutedForeground).
  const iconHex = listIconColorToHex(list.iconColor) ?? theme.mutedForeground;

  return (
    <View className="flex-row items-center gap-2 bg-background px-3 pb-1 pt-4">
      {/* Liste rengi — kanban kolonundaki yatay şeridin (DEM-209) liste-görünümü
          karşılığı: section başlığının solunda ince dikey bant. */}
      {accentHex != null ? (
        <View className="h-4 w-1 rounded-full" style={{ backgroundColor: accentHex }} />
      ) : null}
      {listIcon != null ? (
        <Icon name={featherForListIcon(listIcon)} size={15} color={iconHex} />
      ) : null}
      <Text weight="semibold" numberOfLines={1} className="flex-1 text-sm text-foreground">
        {list.title}
      </Text>
      <Text className="text-xs text-muted-foreground">{count}</Text>
      {canEdit && !listPending ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.board.listActions}
          hitSlop={8}
          onPress={() => onOpenListActions(list)}
          className="ml-1 active:opacity-60"
        >
          <Icon name="more-vertical" size={18} color={theme.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
});

/**
 * Section altı — boş listede "Kart yok" + (member+ ise) satır-içi "Kart ekle"
 * composer'ı. Composer açık/kapalı durumu bileşenin **kendi** `useState`'inde
 * tutulur (kanban `BoardColumnImpl` deseni) — section sırası sabit olduğundan
 * `renderSectionFooter` her board render'ında aynı pozisyondaki footer'ı
 * yeniden çizse de React state'i korur. Böylece bir listenin composer'ını açmak
 * diğer section footer'larını yeniden render etmez (DEM-226 izolasyonu).
 */
const ListSectionFooter = memo(function ListSectionFooter({
  list,
  isEmpty,
  canEdit,
  onCreateCard,
}: {
  list: BoardList;
  isEmpty: boolean;
  canEdit: boolean;
  onCreateCard: (listId: string, title: string) => void;
}) {
  const theme = useTheme();
  const [composerOpen, setComposerOpen] = useState(false);

  return (
    <View className="gap-2 px-3 pb-3 pt-1">
      {isEmpty ? (
        <Text className="px-1 py-1 text-xs text-muted-foreground">{strings.board.emptyList}</Text>
      ) : null}
      {!canEdit ? null : composerOpen ? (
        <InlineComposer
          placeholder={strings.board.addCardPlaceholder}
          submitLabel={strings.board.addCardSubmit}
          onSubmit={(title) => onCreateCard(list.id, title)}
          onCancel={() => setComposerOpen(false)}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.board.addCard}
          onPress={() => setComposerOpen(true)}
          className="flex-row items-center gap-2 rounded-lg px-1 py-2 active:opacity-60"
        >
          <Icon name="plus" size={16} color={theme.mutedForeground} />
          <Text weight="medium" className="text-sm text-muted-foreground">
            {strings.board.addCard}
          </Text>
        </Pressable>
      )}
    </View>
  );
});

/**
 * Liste şeridinin sonundaki "Liste ekle" satırı (kanban "Liste ekle" kolonunun
 * dikey karşılığı). Kapalıyken kesik çerçeveli buton; dokununca satır-içi
 * composer açılır — oluşturduktan sonra açık kalır (art arda liste ekleme).
 */
function ListAddRow({ onCreate }: { onCreate: (title: string) => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View className="px-3 pb-6 pt-1">
      {open ? (
        <InlineComposer
          placeholder={strings.board.addListPlaceholder}
          submitLabel={strings.board.addList}
          onSubmit={onCreate}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.board.addList}
          onPress={() => setOpen(true)}
          className="h-12 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 active:opacity-70"
        >
          <Icon name="plus" size={18} color={theme.mutedForeground} />
          <Text weight="medium" className="text-sm text-muted-foreground">
            {strings.board.addList}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Board liste görünümü (DEM-233) — kanban kolonlarının dikey, listelere göre
 * gruplu karşılığı. Her aktif liste bir `SectionList` section'ı: başlık +
 * kartlar (tam genişlik `CardRow`) + altında "Kart ekle". Section'lar düz akar
 * (katlama yok — kullanıcı kararı). Veri katmanı kanbanla aynı: `board.get`
 * çıktısı board ekranında gruplanıp `cardsByList` olarak verilir.
 *
 * Pull-to-refresh `SectionList`'in kendisindedir — kanbanın dış scroll'u
 * yatay olduğu için yenileme jestini kolon `FlatList`'lerine koymak gerekiyordu
 * (Faz 7M); liste görünümünün dış scroll'u dikey olduğundan tek `RefreshControl`
 * yeter.
 */
export function BoardListView({
  lists,
  cardsByList,
  canEdit,
  onCreateCard,
  onCreateList,
  onOpenListActions,
  onMoveCard,
  refreshing,
  onRefresh,
}: BoardListViewProps) {
  const theme = useTheme();
  // Tablet floating pill nav son içeriği ("Liste ekle"/son kart) örtmesin.
  const navInset = useFloatingNavInset();

  const sections = useMemo<BoardSection[]>(
    () =>
      lists.map((list) => ({
        key: list.id,
        list,
        data: cardsByList.get(list.id) ?? EMPTY_CARDS,
      })),
    [lists, cardsByList],
  );

  const renderItem = useCallback<SectionListRenderItem<BoardCard, BoardSection>>(
    ({ item }) => <CardListRow card={item} canEdit={canEdit} onMoveCard={onMoveCard} />,
    [canEdit, onMoveCard],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<BoardCard, BoardSection> }) => (
      <ListSectionHeader
        list={section.list}
        count={section.data.length}
        canEdit={canEdit}
        onOpenListActions={onOpenListActions}
      />
    ),
    [canEdit, onOpenListActions],
  );

  const renderSectionFooter = useCallback(
    ({ section }: { section: SectionListData<BoardCard, BoardSection> }) => (
      <ListSectionFooter
        list={section.list}
        isEmpty={section.data.length === 0}
        canEdit={canEdit}
        onCreateCard={onCreateCard}
      />
    ),
    [canEdit, onCreateCard],
  );

  return (
    <SectionList
      sections={sections}
      keyExtractor={(card) => card.id}
      className="flex-1"
      // Alt boşluk: tablet'te pill'i temizler, phone'da taban `pb-2` (8).
      contentContainerStyle={{ paddingBottom: navInset || 8 }}
      stickySectionHeadersEnabled={false}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      renderSectionFooter={renderSectionFooter}
      ListFooterComponent={canEdit ? <ListAddRow onCreate={onCreateList} /> : null}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.mutedForeground}
        />
      }
      showsVerticalScrollIndicator={false}
    />
  );
}
