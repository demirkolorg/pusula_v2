import { useCallback, useMemo } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedRef,
} from 'react-native-reanimated';
import type { RouterOutputs } from '@pusula/api';
import {
  isOptimisticItemId,
  moveId,
  neighboursForReorder,
} from '@/lib/checklist-reorder';
import { strings } from '@/lib/strings';

type ChecklistItem = RouterOutputs['checklist']['list'][number]['items'][number];

/** Sürüklemeyi başlatan uzun-basma süresi (ms) — kısa tap/sola swipe etkilenmez. */
const LONG_PRESS_MS = 280;
/** Kaldırma/oturma animasyon süresi (ms). */
const SETTLE_MS = 180;

/**
 * Sürüklenebilir kontrol listesi maddeleri (manuel reanimated sortable).
 *
 * `cards/[cardId].tsx` checklist'i bir `Animated.ScrollView` içinde (FlatList
 * DEĞİL) render eder; bu yüzden `DraggableFlatList` kullanılamaz — burada
 * absolute-konumlu, elle yazılmış dikey sortable çizilir.
 *
 * ## Değişken yükseklik stratejisi
 * Satır yüksekliği DEĞİŞKEN (uzun metin sarılır). Sabit `ROW_HEIGHT`
 * VARSAYILMAZ: her satırın yüksekliği `onLayout` ile ölçülüp `heights`
 * shared-value'sunda tutulur; her satırın dikey ofseti kendinden önceki
 * satırların ölçülen yüksekliklerinin toplamıdır. Sürükleme sırasında diğer
 * satırlar, sürüklenen maddenin geçtiği yöne göre kendi gerçek yükseklikleri
 * kadar (sabit varsayım değil) yer açar. Ölçüm tamamlanana kadar (ilk frame)
 * yükseklikler 0 kabul edilir; `onLayout` mikro-saniyeler içinde gelir ve
 * statik (sürüklemeyen) durumda satırlar zaten normal akışta dizildiğinden
 * görsel bir sıçrama olmaz — sortable yalnız sürükleme aktifken absolute moda
 * geçer.
 *
 * ## Gesture çakışması
 * Satır içeriği (`renderItem`) ZATEN tap (rename) + sola-swipe (sil) jestlerine
 * sahip (`ChecklistItemRow` → `SwipeRow`). Drag jesti yalnız UZUN BASMA ile
 * etkinleşir (`Gesture.LongPress`), sonra `Gesture.Pan` ile dikey takip eder.
 * `Gesture.Simultaneous` yerine long-press kapısı kullanılır: pan yalnız
 * long-press başarıyla aktive olduktan sonra `dragging` bayrağıyla hareketi
 * uygular. Böylece:
 * - kısa tap → long-press tetiklenmez, içerideki rename Pressable çalışır;
 * - sola yatay swipe (long-press eşiğinden önce) → içerideki `SwipeRow` pan'i
 *   sahiplenir, drag başlamaz;
 * - uzun bas + dikey çek → drag.
 * Dış `ScrollView`'un dikey scroll'u, drag aktifken `onDragActiveChange(true)`
 * ile geçici kilitlenir (üst bileşen `scrollEnabled`'ı kapatır).
 */
export type SortableChecklistItemsProps = {
  items: ChecklistItem[];
  /** `false` → sürükleme tümden devre dışı (viewer / salt-okunur). */
  canDrag: boolean;
  /**
   * Bir maddenin yeni komşularına göre taşınması istendiğinde — yalnız
   * `onDragEnd`'de bir kez (drag SIRASINDA çağrılmaz; CLAUDE.md: drag sırasında
   * mutation yok). `beforeItemId`/`afterItemId` gerçek (optimistic olmayan)
   * komşulardır; liste başı → `beforeItemId` undefined, son → `afterItemId`
   * undefined. `orderedIds` taşıma sonrası tam sıra (üst bileşen optimistic
   * cache patch'i için).
   */
  onReorder: (args: {
    itemId: string;
    beforeItemId: string | undefined;
    afterItemId: string | undefined;
    orderedIds: string[];
  }) => void;
  /** Sürükleme başlayınca/bitince — üst bileşen dış scroll'u kilitler/açar. */
  onDragActiveChange?: (active: boolean) => void;
  /**
   * Dış (kart detay) scroll'unun animated ref'i. Verilirse drag Pan'ı bu scroll
   * ile `simultaneousWithExternalGesture` üzerinden koordine edilir — RNGH-aware
   * olmayan native dikey `Animated.ScrollView` içinde `activateAfterLongPress`
   * Pan'ı aksi halde aktive OLMAZ (scroll responder long-press timer'ını keser).
   * Verilmezse koordinasyon atlanır (drag yine de denenir; salt-okunur/test).
   */
  scrollRef?: AnimatedRef<Animated.ScrollView>;
  /** Tek bir madde satırını çizer (içerikteki tap/swipe jestleri korunur). */
  renderItem: (item: ChecklistItem) => React.ReactNode;
};

export function SortableChecklistItems({
  items,
  canDrag,
  onReorder,
  onDragActiveChange,
  scrollRef,
  renderItem,
}: SortableChecklistItemsProps) {
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  // Liste içinde optimistic madde varsa drag'i tümden kapat (en güvenli yol):
  // optimistic satır gerçek pozisyon almadan komşu hesabı kaymalı olur ve
  // sürükleme hedefi belirsizleşir. Optimistic madde `onSettled` invalidate ile
  // gerçeğe dönünce drag yeniden açılır. (Gereksinim §5.)
  const hasOptimistic = useMemo(() => itemIds.some(isOptimisticItemId), [itemIds]);
  const dragEnabled = canDrag && !hasOptimistic && items.length > 1;

  return (
    <SortableInner
      // `key` ile sıra/uzunluk değişiminde shared-value'lar tazelenir — eski
      // ölçümler yeni listeye taşmaz (madde eklenince/silinince temiz başlangıç).
      //
      // ZORUNLU — performans için KALDIRMAYIN: bu remount aynı zamanda gesture
      // worklet closure'larının (`finishReorder` içindeki `itemIds[from]`,
      // `moveId(itemIds, …)` vb.) `itemIds`'in güncel sürümünü yakalamasını
      // garanti eder. `key` kaldırılırsa `SortableInner` aynı instance'ta kalır;
      // worklet'ler ESKİ `itemIds` closure'ını taşıyabilir ve reorder yanlış
      // id/komşu hesaplayabilir (`from`/`to` index'leri kaymış listeye gider).
      key={itemIds.join('|')}
      items={items}
      itemIds={itemIds}
      dragEnabled={dragEnabled}
      onReorder={onReorder}
      onDragActiveChange={onDragActiveChange}
      scrollRef={scrollRef}
      renderItem={renderItem}
    />
  );
}

type SortableInnerProps = {
  items: ChecklistItem[];
  itemIds: string[];
  dragEnabled: boolean;
  onReorder: SortableChecklistItemsProps['onReorder'];
  onDragActiveChange: SortableChecklistItemsProps['onDragActiveChange'];
  scrollRef: SortableChecklistItemsProps['scrollRef'];
  renderItem: SortableChecklistItemsProps['renderItem'];
};

function SortableInner({
  items,
  itemIds,
  dragEnabled,
  onReorder,
  onDragActiveChange,
  scrollRef,
  renderItem,
}: SortableInnerProps) {
  const count = items.length;

  // Her satırın ölçülen yüksekliği (px) — index'e göre. Sabit yükseklik YOK;
  // değişken yükseklik stratejisi (dosya başı yorum) bu diziye dayanır.
  const heights = useSharedValue<number[]>(new Array(count).fill(0));
  // Aktif sürüklenen satırın index'i (-1 → sürükleme yok). UI-thread'inde okunur.
  const activeIndex = useSharedValue(-1);
  // Sürüklenen satırın, başlangıç konumundan dikey kayması (px).
  const dragY = useSharedValue(0);
  // Sürüklenen satırın o anki HEDEF index'i (komşuların yer açması bununla
  // hesaplanır) — UI-thread'inde dragY'den türetilir.
  const targetIndex = useSharedValue(-1);
  // Toplam içerik yüksekliği — absolute mod aktifken kapsayıcının min yüksekliği.
  // `heights`'tan TÜRETİLİR (aşağıdaki `useAnimatedReaction`); `handleLayout`
  // içinde DOĞRUDAN yazılmaz — tek kaynak `heights`, böylece eşzamanlı `onLayout`
  // yayınlarında stale-snapshot/lost-update riski yok.
  const totalHeight = useSharedValue(0);

  // `totalHeight`'i `heights`'tan türet (çift kaynağı kaldır). `heights` atomik
  // `modify` ile güncellendiğinden bu reaction her tutarlı snapshot'ta toplamı
  // yeniden hesaplar; `handleLayout` artık `totalHeight.value` yazmaz.
  useAnimatedReaction(
    () => heights.value.reduce((a, b) => a + (b ?? 0), 0),
    (sum) => {
      totalHeight.value = sum;
    },
  );

  // Kapsayıcı yüksekliği: sürükleme sırasında TÜM satırlar `position:absolute`
  // olur → normal akış çöker ve kapsayıcı 0'a iner. Bunu önlemek için sürükleme
  // aktifken kapsayıcıya ölçülen toplam yükseklik `minHeight` olarak verilir;
  // statik durumda akış zaten doğal yükseklik üretir (minHeight 0).
  const containerStyle = useAnimatedStyle(() => ({
    minHeight: activeIndex.value !== -1 ? totalHeight.value : 0,
  }));

  // Sürükleme aktif/pasif → üst bileşene bildir (dış `ScrollView` scroll kilidi).
  // React state TUTULMAZ: absolute moda geçiş tamamen UI-thread'inde
  // (`containerStyle` + satır `animatedStyle`) yapılır; burada yalnız dış scroll
  // kilidi için JS köprüsü geçilir.
  const setDraggingJS = useCallback(
    (active: boolean) => {
      onDragActiveChange?.(active);
    },
    [onDragActiveChange],
  );

  // Bir satırın ÜST kenar ofseti (kendinden önceki satırların yükseklik toplamı).
  const offsetFor = useCallback(
    (index: number) => {
      'worklet';
      let sum = 0;
      for (let i = 0; i < index; i += 1) sum += heights.value[i] ?? 0;
      return sum;
    },
    [heights],
  );

  const handleLayout = useCallback(
    (index: number, event: LayoutChangeEvent) => {
      const h = event.nativeEvent.layout.height;
      // ATOMİK güncelleme: birden fazla satır aynı frame'de `onLayout`
      // yayınlarsa, JS-thread'inde `[...heights.value]` snapshot'ı okuyup geri
      // yazmak lost-update'e yol açar (son yazan diğer index'leri ezer →
      // bazı yükseklikler 0 kalır). `modify` worklet'i mevcut diziyi yerinde
      // güncelleyip yeni referans döndürür; çağrılar sıraya alınır, kayıp yok.
      // `totalHeight` bu değişimden `useAnimatedReaction` ile türetilir; burada
      // ayrıca yazılmaz.
      heights.modify((arr) => {
        'worklet';
        // `noUncheckedIndexedAccess`: `arr[index]` `number | undefined`; eşitlik
        // karşılaştırması güvenli (undefined === h yalnız h tanımsızsa true).
        if (arr[index] === h) return arr;
        arr[index] = h;
        return arr;
      });
    },
    [heights],
  );

  // Sürükleme bittiğinde JS tarafında reorder'ı tetikle. UI-thread `targetIndex`
  // hesaplar; burada güvenli (JS) dizilerle komşu çözümü yapılır.
  const finishReorder = useCallback(
    (from: number, to: number) => {
      setDraggingJS(false);
      if (from === to || from < 0 || to < 0) return;
      const orderedIds = moveId(itemIds, from, to);
      const movedId = itemIds[from];
      if (!movedId) return;
      const { beforeItemId, afterItemId } = neighboursForReorder(orderedIds, movedId);
      onReorder({ itemId: movedId, beforeItemId, afterItemId, orderedIds });
    },
    [itemIds, onReorder, setDraggingJS],
  );

  return (
    <Animated.View style={containerStyle}>
      {items.map((item, index) => (
        <SortableRow
          key={item.id}
          index={index}
          count={count}
          dragEnabled={dragEnabled}
          heights={heights}
          activeIndex={activeIndex}
          dragY={dragY}
          targetIndex={targetIndex}
          offsetFor={offsetFor}
          onLayout={handleLayout}
          // `onDragStart`/`onDragEnd` JS callback'leridir; satır gesture
          // worklet'inden `runOnJS` ile çağrılır (burada sarılmaz).
          onDragStart={() => setDraggingJS(true)}
          onDragEnd={finishReorder}
          scrollRef={scrollRef}
        >
          {renderItem(item)}
        </SortableRow>
      ))}
    </Animated.View>
  );
}

type SharedNum = ReturnType<typeof useSharedValue<number>>;
type SharedNumArr = ReturnType<typeof useSharedValue<number[]>>;

type SortableRowProps = {
  index: number;
  count: number;
  dragEnabled: boolean;
  heights: SharedNumArr;
  activeIndex: SharedNum;
  dragY: SharedNum;
  targetIndex: SharedNum;
  offsetFor: (index: number) => number;
  onLayout: (index: number, event: LayoutChangeEvent) => void;
  onDragStart: () => void;
  onDragEnd: (from: number, to: number) => void;
  scrollRef: SortableChecklistItemsProps['scrollRef'];
  children: React.ReactNode;
};

function SortableRow({
  index,
  count,
  dragEnabled,
  heights,
  activeIndex,
  dragY,
  targetIndex,
  offsetFor,
  onLayout,
  onDragStart,
  onDragEnd,
  scrollRef,
  children,
}: SortableRowProps) {
  // UI-thread: `dragY`'den hedef index'i türet — sürüklenen satırın merkezi
  // hangi satırın aralığına düştüyse oraya yerleşir. Değişken yüksekliklerle
  // çalışır (heights ile gerçek ofsetler). Yalnız AKTİF satırın reaction'ı
  // `targetIndex` yazar (diğer satırlarınki erken döner).
  useAnimatedReaction(
    () => ({ active: activeIndex.value, dy: dragY.value }),
    ({ active, dy }) => {
      if (active !== index) return;
      // Sürüklenen satırın merkezinin mutlak Y'si.
      const startOffset = offsetFor(active);
      const activeHeight = heights.value[active] ?? 0;
      const center = startOffset + dy + activeHeight / 2;
      // Merkez hangi satır aralığına düşüyor → hedef index.
      let acc = 0;
      let target = count - 1;
      for (let i = 0; i < count; i += 1) {
        const h = heights.value[i] ?? 0;
        if (center < acc + h) {
          target = i;
          break;
        }
        acc += h;
      }
      targetIndex.value = target;
    },
  );

  const animatedStyle = useAnimatedStyle(() => {
    const active = activeIndex.value;
    const anyDragging = active !== -1;

    // Hiç sürükleme yoksa: normal akış (relative) — `position` static, transform
    // sıfır. Bu, statik durumda değişken yüksekliklerin doğal akışta dizilmesini
    // sağlar (absolute konum yalnız sürükleme süresince devreye girer).
    if (!anyDragging) {
      return {
        position: 'relative',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 0,
        transform: [{ translateY: 0 }, { scale: 1 }],
        opacity: 1,
        shadowOpacity: 0,
        elevation: 0,
      };
    }

    const baseOffset = offsetFor(index);

    if (active === index) {
      // Sürüklenen satır: parmağı takip eder, kalkmış görünür (scale + gölge).
      return {
        position: 'absolute',
        top: baseOffset,
        left: 0,
        right: 0,
        zIndex: 10,
        transform: [{ translateY: dragY.value }, { scale: 1.03 }],
        opacity: 0.96,
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
      };
    }

    // Diğer satırlar: sürüklenen madde aralarından geçtiyse kendi gerçek
    // yükseklikleri kadar yer açar (yukarı/aşağı kayar). `target` sürüklenen
    // maddenin hedef index'i; aradaki satırlar sürüklenenin yüksekliği kadar
    // ötelenir.
    const target = targetIndex.value;
    const activeHeight = heights.value[active] ?? 0;
    let shift = 0;
    if (active < index && index <= target) {
      // Sürüklenen yukarıdan aşağı geçiyor → bu satır yukarı kayar.
      shift = -activeHeight;
    } else if (active > index && index >= target) {
      // Sürüklenen aşağıdan yukarı geçiyor → bu satır aşağı kayar.
      shift = activeHeight;
    }

    return {
      position: 'absolute',
      top: baseOffset,
      left: 0,
      right: 0,
      zIndex: 0,
      transform: [{ translateY: withTiming(shift, { duration: SETTLE_MS }) }, { scale: 1 }],
      opacity: 1,
      shadowOpacity: 0,
      elevation: 0,
    };
  });

  // Drag jesti — TEK `Gesture.Pan` + `activateAfterLongPress`. Pan yalnız
  // parmak `LONG_PRESS_MS` boyunca (hareket etmeden) basılı kalınca aktive
  // olur. Bu, ayrı bir LongPress + Pan koordinasyonuna gerek bırakmadan
  // gesture çakışmasını çözer:
  // - **Kısa tap:** Pan aktive olmadan biter → içerideki rename `Pressable`
  //   çalışır.
  // - **Sola yatay swipe (long-press eşiğinden önce):** parmak hemen hareket
  //   ettiğinden `activateAfterLongPress` zamanlayıcısı iptal olur, dış Pan
  //   aktive olmaz → içteki `SwipeRow` Pan'i (sil) sahiplenir.
  // - **Uzun bas + dikey çek:** Pan aktive olur, `onStart`'ta satır kalkar,
  //   `onUpdate`'te parmağı dikey takip eder.
  // `onStart` (aktivasyon anı) sürükleme state'ini kurar; her satırın kendi
  // `index`'i `activeIndex`'e yazılır.
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(dragEnabled)
      .activateAfterLongPress(LONG_PRESS_MS);
    // Dış scroll ile koordinasyon: RNGH-aware olmayan native dikey
    // `Animated.ScrollView` içinde long-press Pan'ı, scroll responder'ı
    // tarafından yutulmaması için scroll gesture'ıyla eşzamanlı tanınmalı.
    // Bu olmadan `onStart` HİÇ tetiklenmez (madde kalkmaz). `scrollRef`
    // verilmezse koordinasyon atlanır (eski davranış).
    //
    // `as never`: RNGH'nin `simultaneousWithExternalGesture` tip imzası
    // reanimated `useAnimatedRef` (`current: T | null`) ile henüz uyumlu değil
    // (RNGH `RefObject<ComponentType | undefined>` bekler); runtime'da
    // AnimatedRef kabul edilir (RNGH scroll koordinasyon dokümanının deseni).
    if (scrollRef) pan.simultaneousWithExternalGesture(scrollRef as never);
    return pan
        .onStart(() => {
          'worklet';
          activeIndex.value = index;
          targetIndex.value = index;
          dragY.value = 0;
          runOnJS(onDragStart)();
        })
        .onUpdate((event) => {
          'worklet';
          if (activeIndex.value !== index) return;
          dragY.value = event.translationY;
        })
        .onEnd(() => {
          'worklet';
          if (activeIndex.value !== index) return;
          const from = index;
          const to = targetIndex.value;
          cancelAnimation(dragY);
          activeIndex.value = -1;
          targetIndex.value = -1;
          dragY.value = 0;
          runOnJS(onDragEnd)(from, to);
        })
        .onFinalize((_event, success) => {
          'worklet';
          // Guard: `onEnd` başarılı yolda `activeIndex`'i -1 yaptığı için, bu
          // satırın finalize'i `activeIndex.value !== index` olur ve erken döner
          // → ÇİFT `onDragEnd` çağrısı önlenir (onEnd zaten bir kez çağırdı).
          // `onStart` hiç çalışmadan finalize gelirse (jest aktive olmadan
          // bitti) `activeIndex` zaten -1'dir → yine erken dön, no-op.
          if (activeIndex.value !== index) return;
          if (!success) {
            // İptal (jest devralındı) → reorder'sız temizle.
            activeIndex.value = -1;
            targetIndex.value = -1;
            dragY.value = 0;
            runOnJS(onDragEnd)(index, index);
          }
        });
  }, [dragEnabled, index, activeIndex, targetIndex, dragY, onDragStart, onDragEnd, scrollRef]);

  return (
    <Animated.View style={animatedStyle} onLayout={(e) => onLayout(index, e)}>
      <GestureDetector gesture={gesture}>
        {/* Erişilebilirlik: sürükleme açık satırlarda uzun-bas-sürükle ipucu.
            İçerideki tap/checkbox/swipe etkileşimleri kendi label'larını taşır;
            bu View yalnız drag jestini barındırır. */}
        <View
          accessibilityHint={
            dragEnabled ? strings.cardDetail.checklistItemReorderHint : undefined
          }
        >
          {children}
        </View>
      </GestureDetector>
    </Animated.View>
  );
}
