/**
 * Kart detayı "bildirim hedefine kaydır + vurgula" koordinatörü (DEM — 2026-06-20).
 *
 * Bildirim merkezinden / push'tan bir bildirime dokununca açılan kart detayında
 * hedef öğe (yorum / kontrol listesi maddesi / ek) ekran dışındaysa kullanıcı
 * `withSequence` yeşil flash'ını göremiyordu. Bu modül flash'la birlikte **tek
 * seferlik otomatik scroll** ekler: hedef bileşen ölçülünce dış `Animated.ScrollView`
 * o öğenin dikey offset'ine kaydırılır.
 *
 * Mimari — neden Context + `measureLayout`:
 *  - Hedef bileşenler (CommentRow / ChecklistItemRow / AttachmentTile) dış
 *    scroll'un içinde **çok katmanlı** iç içedir (bölüm kartı → liste → satır).
 *    Her ara `View`'a `onLayout` koyup y-offset'leri toplamak kırılgan olurdu.
 *    Bunun yerine hedef satır kendi wrapper `View`'ını, scroll'un **iç içerik
 *    node'una** (`getInnerViewNode()`) göre `measureLayout` ile ölçer — tek
 *    çağrıda mutlak (scroll-içi) y elde edilir, katman sayısından bağımsız.
 *  - Tek aktif hedef vardır (bildirim tipine göre `commentId` | `checklistItemId`
 *    | `highlightItemId` | `attachmentId`'den biri). Provider bunu tutar; eşleşen
 *    bileşen kendini ölçüp scroll'u tetikler.
 *
 * Guard'lar:
 *  - Scroll **bir kez** çalışır (`scrolledRef`). Re-render / layout yeniden ölçümü
 *    tekrar kaydırmaz. Hedef zaten görünürdeyse de bir kez `scrollTo` çağrılır —
 *    küçük/no-op kaymadır, görünürlük sınamasıyla uğraşmaya değmez (idempotent).
 *  - `reduceMotion` (Reanimated) açıkken `animated: false` ile anında konumlanır
 *    (`docs/architecture/20-hareket-etkilesim-sistemi.md` §20.11 — motion/scroll
 *    token + reduced-motion'a saygı).
 *  - Hedef öğe silinmiş / listede yoksa o bileşen hiç render edilmez → `register`
 *    çağrılmaz → scroll olmaz (sessiz no-op, defansif).
 *
 * Bu modül flash'ı yönetmez; flash her satır bileşeninin kendi `withSequence`'ı
 * olarak kalır. Burada yalnız "nereye kaydırılacağı" merkezîleştirilir.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { type LayoutChangeEvent, type View } from 'react-native';
import type Animated from 'react-native-reanimated';
import type { AnimatedRef } from 'react-native-reanimated';
import { resolveHighlightScroll } from '@/components/card-detail/scroll-highlight-logic';

type ScrollHighlightContextValue = {
  /** Aktif vurgu hedefi (tek). `null` ise deep-link odak yok. */
  targetId: string | null;
  /**
   * Bir vurgulanan bileşenin ölçülen scroll-içi y-offset'ini bildirir. İlk
   * geçerli çağrıda (tek sefer) dış scroll oraya kaydırılır.
   */
  registerOffset: (id: string, y: number) => void;
  /**
   * Dış scroll konteynerinin ekran-mutlak üst (pageY) konumunu `measure` ile
   * ölçüp callback'e verir. Hedef satır kendi pageY'sini bununla farklayıp
   * scroll-içi y'yi hesaplar. ScrollView bağlı değilse callback çağrılmaz.
   */
  measureScrollTop: (cb: (pageY: number) => void) => void;
};

/** Bir host component ref'inin `measure` imzası (Fabric/eski mimari ortak). */
type Measurable = {
  measure?: (
    f: (x: number, y: number, w: number, h: number, px: number, py: number) => void,
  ) => void;
};

const ScrollHighlightContext = createContext<ScrollHighlightContextValue | null>(null);

type ScrollHighlightProviderProps = {
  /** Aktif vurgu hedefi — kart ekranı bildirim param'larından tek id türetir. */
  targetId: string | null;
  /** Dış `Animated.ScrollView` ref'i (kaydırılacak konteyner). */
  scrollRef: AnimatedRef<Animated.ScrollView>;
  /** Reduced-motion açık mı — `true` ise scroll animasyonsuz konumlanır. */
  reduceMotion: boolean;
  children: ReactNode;
};

/**
 * Kart detayı scroll'unu sarar; vurgulanan hedef ölçülünce bir kez oraya kaydırır.
 */
export function ScrollHighlightProvider({
  targetId,
  scrollRef,
  reduceMotion,
  children,
}: ScrollHighlightProviderProps) {
  // Bu hedef için scroll tetiklendi mi — tek seferlik guard. `targetId`
  // değişirse (aynı ekranda farklı param ile yeniden gelinirse) sıfırlanır.
  const scrolledRef = useRef(false);

  useEffect(() => {
    scrolledRef.current = false;
  }, [targetId]);

  const registerOffset = useCallback(
    (id: string, y: number) => {
      const decision = resolveHighlightScroll({
        id,
        targetId,
        alreadyScrolled: scrolledRef.current,
        y,
        reduceMotion,
      });
      if (!decision) return;
      scrolledRef.current = true;
      // Native `ScrollView.scrollTo` — JS thread'inden doğrudan çağrılır;
      // Reanimated worklet köprüsüne (UI-thread `scrollTo` helper'ı) hiç
      // girilmez. Böylece checklist sürükleme gesture'ının `scrollRef` ile
      // kurduğu `simultaneousWithExternalGesture` koordinasyonu bozulmaz: bu
      // programatik scroll açılışta (drag başlamadan) tek sefer çalışan ayrı bir
      // imperatif çağrıdır. `useAnimatedRef`'in `.current`'ı RN ScrollView
      // instance'ıdır (`scrollTo` metodunu taşır).
      const scroll = scrollRef.current as unknown as
        | { scrollTo?: (opts: { y: number; animated: boolean }) => void }
        | null;
      scroll?.scrollTo?.({ y: decision.scrollY, animated: decision.animated });
    },
    [targetId, scrollRef, reduceMotion],
  );

  const measureScrollTop = useCallback(
    (cb: (pageY: number) => void) => {
      const scroll = scrollRef.current as unknown as Measurable | null;
      scroll?.measure?.((_x, _y, _w, _h, _px, py) => cb(py));
    },
    [scrollRef],
  );

  const value = useMemo<ScrollHighlightContextValue>(
    () => ({ targetId, registerOffset, measureScrollTop }),
    [targetId, registerOffset, measureScrollTop],
  );

  return (
    <ScrollHighlightContext.Provider value={value}>
      {children}
    </ScrollHighlightContext.Provider>
  );
}

/**
 * Vurgulanan bir satır bileşeni için scroll-to kancası.
 *
 * `highlighted` true ve bileşen aktif hedefse: bileşenin wrapper `View`'ını dış
 * scroll'un iç içerik node'una göre `measureLayout` ile ölçüp y-offset'i
 * provider'a bildirir (provider bir kez kaydırır). Provider yoksa (kart normal
 * açıldıysa, ya da test) tüm dönüşler no-op'tur — bileşenler provider'sız da
 * çalışır.
 *
 * Dönen `ref` + `onLayout` aynı hedef wrapper `View`'a bağlanır. `onLayout`
 * ölçümü tetikler (layout hazır olduğunda); `measureLayout` katmanlar arası
 * gerçek scroll-içi konumu verir (salt `onLayout` y'si yalnız en yakın parent'a
 * görelidir, yetmez).
 */
export function useScrollHighlightTarget(
  id: string,
  highlighted: boolean,
): {
  ref: (node: View | null) => void;
  onLayout: (event: LayoutChangeEvent) => void;
} {
  const ctx = useContext(ScrollHighlightContext);
  const nodeRef = useRef<View | null>(null);
  // Bu bileşen için zaten ölçtük mü — `onLayout` birden çok kez tetiklenebilir;
  // gereksiz `measureLayout` çağrılarını kısarız (provider zaten tek scroll'u
  // garanti eder, bu yalnız maliyet azaltır).
  const measuredRef = useRef(false);

  const active = highlighted && ctx?.targetId === id;

  // Hedef artık aktif değilse (ekran yeniden kullanıldı / param değişti) yeniden
  // ölçmeye izin ver.
  useEffect(() => {
    if (!active) measuredRef.current = false;
  }, [active]);

  const runMeasure = useCallback(() => {
    if (!ctx || !active || measuredRef.current) return;
    const node = nodeRef.current as unknown as Measurable | null;
    if (!node?.measure) return;
    measuredRef.current = true;
    // Fabric-uyumlu ölçüm: `measureLayout` New Architecture'da `relativeTo`
    // olarak number node handle kabul etmiyor ("ref to a native component"
    // hatası). Bunun yerine hedefin ve scroll konteynerinin ekran-mutlak
    // pageY'lerini `measure` ile alıp farkını scroll-içi y olarak kullanırız.
    // Deep-link açılışında scroll offset 0'dır (kart yeni mount edilir), bu
    // yüzden fark doğrudan içerik koordinatına denk gelir. `measure` host
    // ref'lerinde (View + Animated.View) çalışır; node handle gerektirmez.
    ctx.measureScrollTop((scrollPageY) => {
      node.measure?.((_x, _y, _w, _h, _px, targetPageY) => {
        ctx.registerOffset(id, Math.max(0, targetPageY - scrollPageY));
      });
    });
  }, [ctx, active, id]);

  const onLayout = useCallback(() => {
    runMeasure();
  }, [runMeasure]);

  const ref = useCallback((node: View | null) => {
    nodeRef.current = node;
  }, []);

  return { ref, onLayout };
}
