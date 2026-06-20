import { View } from 'react-native';
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
   * Checklist madde sürükleme aktif/pasif → kart detay ekranına iletilir
   * (dış `ScrollView` scroll kilidi). Sortable dikey drag pan'i dış scroll'la
   * çakışmasın diye.
   */
  onDragActiveChange?: (active: boolean) => void;
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
 * Yerleşim:
 * - **Tablet (≥768px):** yan-yana — sol `DescriptionEditor` + sağ
 *   `ChecklistSection`, eşit `flex-1` (web kart modali paritesi).
 * - **Phone (<768px):** alt-alta (stacked) — açıklama üstte, yapılacaklar altta.
 *
 * Alt bileşenler kendilerini `DetailSection` ile sarmaz — bu kapsayıcı tek
 * `bg-card` yüzeyi sağlar.
 */
export function DescriptionChecklistTabs({
  cardId,
  description,
  canEdit,
  checklists,
  checklistsError,
  checklistComments,
  initialCommentItemId,
  onDragActiveChange,
}: DescriptionChecklistProps) {
  const isTablet = useIsTablet();

  const checklist = checklistsError ? (
    <Text className="text-sm text-destructive">{strings.cardDetail.sectionError}</Text>
  ) : (
    <ChecklistSection
      cardId={cardId}
      checklists={checklists}
      canEdit={canEdit}
      comments={checklistComments}
      initialCommentItemId={initialCommentItemId}
      onDragActiveChange={onDragActiveChange}
    />
  );

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-3.5">
      {isTablet ? (
        // Tablet: yan-yana, eşit genişlik (web kart modali paritesi). iPad mini
        // portrait 768px'te sıkı kalır ama kabul edilir.
        <View className="flex-row gap-3">
          <View className="flex-1">
            <DescriptionEditor cardId={cardId} description={description} canEdit={canEdit} />
          </View>
          <View className="flex-1">{checklist}</View>
        </View>
      ) : (
        // Phone: alt-alta (açıklama → yapılacaklar).
        <View className="gap-4">
          <DescriptionEditor cardId={cardId} description={description} canEdit={canEdit} />
          {checklist}
        </View>
      )}
    </View>
  );
}
