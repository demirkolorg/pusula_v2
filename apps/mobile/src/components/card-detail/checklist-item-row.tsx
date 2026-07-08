import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { RouterOutputs } from '@pusula/api';
import { Icon } from '@/components/icon';
import { SwipeRow } from '@/components/swipe-row';
import { Text } from '@/components/text';
import { useScrollHighlightTarget } from '@/components/card-detail/scroll-highlight';
import { strings } from '@/lib/strings';
import { tiptapToPlainText } from '@/lib/tiptap';
import { useTheme } from '@/theme/theme-provider';

type ChecklistItem = RouterOutputs['checklist']['list'][number]['items'][number];

type ChecklistItemRowProps = {
  item: ChecklistItem;
  /** Henüz sunucuda olmayan optimistic satır mı — etkileşim devre dışı. */
  optimistic: boolean;
  /** Çağıran board `member+` mi — `false` ise salt-okunur. */
  canEdit: boolean;
  onToggle: (completed: boolean) => void;
  /** Metne dokununca — üst bileşen madde düzenleme sheet'ini açar. */
  onEdit: () => void;
  onDelete: () => void;
  /**
   * Verilirse satır madde yorum rozetini gösterir; rozete (ya da `commentCount`
   * 0 iken küçük ikona) dokununca bu çağrılır — üst bileşen thread sheet'i açar.
   * Viewer da açabilir (salt-okunur okuma), bu yüzden `canEdit`'ten bağımsızdır.
   * Optimistic satırda rozet gizlenir (madde henüz sunucuda yok).
   */
  onOpenComments?: () => void;
  /** Bildirim deep-link'iyle gelinince bu satır flash vurgulanır (bir kez). */
  highlighted?: boolean;
  /**
   * Verilirse satır sağında küçük bir "alt madde ekle" (+) ikon-butonu çizilir —
   * dokununca bu çağrılır (üst bileşen o maddenin altında girintili bir composer
   * açar). Yalnız derinlik sınırı altındaki (kök + çocuk) maddelerde geçilir;
   * torun (`depth === CHECKLIST_MAX_DEPTH - 1`) satırında geçilmez. Optimistic
   * satırda gizlenir (madde henüz sunucuda yok, ebeveyn id'si optimistic olur).
   */
  onAddSubItem?: () => void;
  /**
   * İç içe (nested) alt maddeler — satırın ALTINA girintili çizilir (üst bileşen
   * özyineli olarak çocukları + alt-madde composer'ını sarar). Kaydırma-sil
   * (`SwipeRow`) yalnız satırın kendisini kapsar; çocuklar dışında kalır.
   */
  children?: ReactNode;
};

/**
 * Tek kontrol listesi maddesinin satırı (DEM-221). Üç aksiyon, satır-içi `x`
 * butonu yok:
 *
 * - **Checkbox'a dokun** → tamamla / geri al (dokunma bölgesi ~48dp).
 * - **Metne dokun** → madde düzenleme sheet'ini açar (`onEdit` — üst bileşen
 *   `ChecklistItemEditSheet`'i mount eder; maddeye yorum yazma akışıyla
 *   simetrik modal düzenleme, satır-içi `TextInput` yerine).
 * - **Sola kaydır** → kırmızı "Sil" (`SwipeRow`).
 *
 * Satır min 48dp — mobil dokunma hedefi standardı. Salt-okunur (`canEdit=false`)
 * ya da optimistic satırda kaydırma ve düzenleme devre dışı; bu durumda satır
 * `SwipeRow` olmadan çizilir.
 */
export function ChecklistItemRow({
  item,
  optimistic,
  canEdit,
  onToggle,
  onEdit,
  onDelete,
  onOpenComments,
  highlighted = false,
  onAddSubItem,
  children,
}: ChecklistItemRowProps) {
  const theme = useTheme();
  // Madde içeriği artık zengin (Tiptap JSON) olabilir (web, 2026-07-08) — mobil
  // şimdilik düz metne indirip gösterir (ham JSON'u önler; biçimli render sonraki
  // tur). Yazma tarafı (composer / edit sheet) da düz metin kalır.
  const plainText = tiptapToPlainText(item.content);

  const interactive = canEdit && !optimistic;

  const flashOpacity = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 8,
    backgroundColor: `rgba(16,185,129,${flashOpacity.value * 0.18})`,
    pointerEvents: 'none',
  }));
  // Flash bir kez oynasın — geri/ileri navigasyon veya re-render'da `highlighted`
  // hâlâ true iken (aynı deep-link param'ı) tekrar tetiklenmesin.
  const flashedRef = useRef(false);
  useEffect(() => {
    if (highlighted && !flashedRef.current) {
      flashedRef.current = true;
      flashOpacity.value = withSequence(
        withTiming(1, { duration: 250 }),
        withDelay(700, withTiming(0, { duration: 500 })),
      );
    }
  }, [highlighted, flashOpacity]);
  // Vurgu hedefiyse ölç + (provider üzerinden) bir kez scroll-to.
  const scrollHighlight = useScrollHighlightTarget(item.id, highlighted);

  // Madde yorum rozeti — thread sheet'i açar. `onOpenComments` verilmeli
  // (yorum bağlamı) ve satır optimistic olmamalı (madde sunucuda). `commentCount
  // > 0` ise sayı görünür; 0 ise yalnız ikon (boş thread'i açıp ilk yorumu
  // yazmak için). 44×44 dokunma hedefi. `?? 0` defansif: eski/yarı yüklenmiş
  // cache satırında `commentCount` tanımsız olabilir (backend alanı yeni);
  // tanımsız → rozet sayısı gizli.
  const commentCount = item.commentCount ?? 0;
  const hasComments = commentCount > 0;
  const commentsBadge =
    onOpenComments && !optimistic ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.cardDetail.itemCommentsOpen}
        hitSlop={6}
        onPress={onOpenComments}
        className="h-11 min-w-11 flex-row items-center justify-center gap-1 px-1 active:opacity-60"
      >
        <Icon
          name="message-square"
          size={16}
          color={hasComments ? theme.primary : theme.mutedForeground}
        />
        {hasComments ? (
          <Text weight="medium" className="text-xs text-primary">
            {commentCount}
          </Text>
        ) : null}
      </Pressable>
    ) : null;

  // "Alt madde ekle" (+) ikon-butonu — derinlik sınırı altındaki maddelerde
  // (üst bileşen `onAddSubItem`'i yalnız o zaman geçer) + satır optimistic
  // değilken. 44×44 dokunma hedefi; `corner-down-right` ikonu "altına ekle"
  // (girintili) niyetini iletir. Sürükleme long-press ile ayrıştığından bu
  // Pressable'ın tek dokunuşu drag'i tetiklemez.
  const addSubButton =
    onAddSubItem && !optimistic ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={strings.cardDetail.checklistSubItemAdd}
        hitSlop={6}
        onPress={onAddSubItem}
        className="h-11 w-11 items-center justify-center active:opacity-60"
      >
        <Icon name="corner-down-right" size={16} color={theme.mutedForeground} />
      </Pressable>
    ) : null;

  const row = (
    <View
      ref={scrollHighlight.ref}
      onLayout={scrollHighlight.onLayout}
      className="min-h-12 flex-row items-start bg-card"
      style={{ position: 'relative' }}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.completed, disabled: !interactive }}
        accessibilityLabel={plainText}
        disabled={!interactive}
        onPress={() => onToggle(!item.completed)}
        className="h-12 w-11 items-center justify-center active:opacity-60"
      >
        <Icon
          name={item.completed ? 'check-square' : 'square'}
          size={22}
          color={item.completed ? theme.success : theme.mutedForeground}
        />
      </Pressable>

      <Pressable
        accessibilityRole={interactive ? 'button' : undefined}
        accessibilityLabel={interactive ? strings.cardDetail.checklistItemEdit : undefined}
        disabled={!interactive}
        onPress={onEdit}
        className="min-h-12 flex-1 justify-center py-2.5 pr-1 active:opacity-60"
      >
        <Text
          className={`text-sm ${
            item.completed ? 'text-muted-foreground line-through' : 'text-foreground'
          }`}
        >
          {plainText}
        </Text>
      </Pressable>

      {/* "Alt madde ekle" (+) — derinlik sınırı altındaki maddelerde; yorum
          rozetinin solunda. */}
      {addSubButton}

      {/* Madde yorum rozeti — `commentCount > 0` ise mesaj ikonu + sayı, 0 ise
          yalnız ikon (boş thread'i açıp ilk yorumu yazmak için). Optimistic
          satırda gizli (madde henüz sunucuda yok, thread çekilemez). Viewer da
          dokunabilir (salt-okunur thread). */}
      {commentsBadge}
      <Animated.View style={flashStyle} />
    </View>
  );

  // Satırın kendisi: interaktif ise kaydır-sil (`SwipeRow`) ile, değilse düz.
  // Kaydırma yalnız satırı kapsar; iç içe çocuklar (aşağıda) dışında kalır.
  const swipeableRow = interactive ? (
    <SwipeRow
      actions={[
        {
          key: 'delete',
          icon: 'trash-2',
          variant: 'destructive',
          label: strings.cardDetail.checklistDeleteAction,
          accessibilityLabel: strings.cardDetail.checklistItemDelete,
          onPress: onDelete,
        },
      ]}
    >
      {row}
    </SwipeRow>
  ) : (
    row
  );

  // Çocuk (alt madde) yoksa fazladan sarmalayıcı View çizme — düz satır döndür
  // (mevcut satır düzeni/testleri korunur). Çocuk varsa satırın altına girintili
  // blok eklenir (girinti + sol sınır üst bileşende, `children` içinde).
  if (!children) return swipeableRow;

  return (
    <View>
      {swipeableRow}
      {children}
    </View>
  );
}
