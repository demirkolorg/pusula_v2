import { View } from 'react-native';
import type Animated from 'react-native-reanimated';
import type { AnimatedRef } from 'react-native-reanimated';
import type { RouterOutputs } from '@pusula/api';
import { Text } from '@/components/text';
import { DescriptionEditor } from '@/components/card-detail/description-editor';
import {
  ChecklistSection,
  type ChecklistCommentContext,
} from '@/components/card-detail/checklist-section';
import { useIsTablet } from '@/lib/use-device-class';
import { strings } from '@/lib/strings';

type Checklists = RouterOutputs['checklist']['list'];

type DescriptionChecklistProps = {
  cardId: string;
  /** Saklanan açıklama (Tiptap JSON string | legacy düz metin | null). */
  description: string | null;
  /** Çağıran board `member+` mi — `false` ise alt bileşenler salt-okunur. */
  canEdit: boolean;
  /** Checklist verisi — board sorgusundan akar. */
  checklists: Checklists;
  /** Checklist sorgusu hata verdi mi? */
  checklistsError: boolean;
  /** Madde yorum bağlamı — `ChecklistSection`'a iletilir (rozet + thread sheet). */
  checklistComments?: ChecklistCommentContext;
  /**
   * Deep-link / bildirimle gelinen madde id'si — `ChecklistSection`'a iletilir;
   * o maddenin yorum thread'i (bottom sheet) otomatik açılır. (Sekme kalktığından
   * checklist her zaman mount; ayrıca sekme geçişine gerek yok.)
   */
  initialCommentItemId?: string;
  /**
   * Bildirim deep-link'iyle gelinince bu id'li checklist maddesi flash vurgulanır.
   * `initialCommentItemId`'den farklı: thread açmaz, yalnız görsel vurgu yapar.
   */
  highlightItemId?: string;
  /**
   * Checklist madde sürükleme aktif/pasif → kart detay ekranına iletilir
   * (dış `ScrollView` scroll kilidi). Sortable dikey drag pan'i dış scroll'la
   * çakışmasın diye.
   */
  onDragActiveChange?: (active: boolean) => void;
  /**
   * Dış scroll'un animated ref'i — `ChecklistSection` → `SortableChecklistItems`
   * zincirine iletilir; sortable'ın uzun-bas Pan'ı bu ref ile koordine edilir
   * (`simultaneousWithExternalGesture`), aksi halde native dikey scroll drag'i yutar.
   */
  scrollRef?: AnimatedRef<Animated.ScrollView>;
};

/**
 * Kart detayında "Açıklama" + "Yapılacaklar" bölümleri, tek `bg-card` yüzeyde.
 *
 * **2026-06-20 — sekme yapısı kaldırıldı.** Önceki segmented control
 * (`[Tümü] [Açıklama] [Yapılacaklar]`) kullanıcı kararıyla çıkarıldı; artık her
 * iki içerik de **her zaman görünür** (eski `'Tümü'` davranışı). Sekme değişimi
 * (`setActive` re-render'ı) Android Fabric'te `CalledFromWrongThreadException` →
 * "navigation context" crash'ini tetikliyordu; sekmesiz yapı bu tetikleyiciyi de
 * ortadan kaldırır.
 *
 * **2026-06-20 — her bölüm kendi başlıklı kartında.** `DescriptionEditor` ve
 * `ChecklistSection` artık kendi `bg-card` yüzeyini + başlığını (solda ad, sağda
 * aksiyonlar) taşır; bu bileşen yalnız yerleşim kapsayıcısıdır (ortak kart yok).
 *
 * Yerleşim:
 * - **Tablet (≥768px):** yan-yana — sol `DescriptionEditor` + sağ
 *   `ChecklistSection`, eşit `flex-1` genişlik + `items-stretch` ile EŞİT
 *   YÜKSEKLİK (her bölüm köküne `fill`→`flex-1`; kısa olan uzun olana gerilir,
 *   web kart modali paritesi).
 * - **Phone (<768px):** alt-alta (stacked) — açıklama üstte, yapılacaklar altta
 *   (gerilme yok; her bölüm doğal yüksekliğinde).
 */
export function DescriptionChecklistTabs({
  cardId,
  description,
  canEdit,
  checklists,
  checklistsError,
  checklistComments,
  initialCommentItemId,
  highlightItemId,
  onDragActiveChange,
  scrollRef,
}: DescriptionChecklistProps) {
  const isTablet = useIsTablet();

  const checklist = checklistsError ? (
    <View
      className={`rounded-xl border border-border bg-card p-3.5 ${isTablet ? 'flex-1' : ''}`}
    >
      <Text className="text-sm text-destructive">{strings.cardDetail.sectionError}</Text>
    </View>
  ) : (
    <ChecklistSection
      cardId={cardId}
      checklists={checklists}
      canEdit={canEdit}
      comments={checklistComments}
      initialCommentItemId={initialCommentItemId}
      highlightItemId={highlightItemId}
      onDragActiveChange={onDragActiveChange}
      scrollRef={scrollRef}
      fill={isTablet}
    />
  );

  return isTablet ? (
    // Tablet: yan-yana, eşit genişlik + EŞİT YÜKSEKLİK (web kart modali paritesi).
    // `items-stretch` + her bölüm köküne `flex-1` (fill) → kısa olan uzun olana
    // gerilir, iki kart hep aynı boyda durur (kısa açıklamanın yarım kesik
    // görünmesi giderildi). Açıklama çok uzunsa kendi "Daha fazla göster" cap'i
    // (maxHeight) devreye girer; checklist o noktada en uzun bölüm olur, açıklama
    // genişletilince tüm içeriği gösterecek yüksekliğe çıkar. iPad mini portrait
    // 768px'te sıkı ama kabul.
    <View className="flex-row items-stretch gap-3">
      <View className="flex-1">
        <DescriptionEditor cardId={cardId} description={description} canEdit={canEdit} fill />
      </View>
      <View className="flex-1">{checklist}</View>
    </View>
  ) : (
    // Phone: alt-alta — her bölüm kendi kartı (12px ara, diğer bölümlerle aynı).
    <View className="gap-3">
      <DescriptionEditor cardId={cardId} description={description} canEdit={canEdit} />
      {checklist}
    </View>
  );
}
