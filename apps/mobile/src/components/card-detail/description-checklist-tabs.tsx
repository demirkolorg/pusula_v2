import { useState } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import type { RouterOutputs } from '@pusula/api';
import { Text } from '@/components/text';
import { DescriptionEditor } from '@/components/card-detail/description-editor';
import { ChecklistSection } from '@/components/card-detail/checklist-section';
import { useIsTablet } from '@/lib/use-device-class';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type Checklists = RouterOutputs['checklist']['list'];

type Tab = 'both' | 'description' | 'checklist';

type DescriptionChecklistTabsProps = {
  cardId: string;
  /** Saklanan açıklama (Tiptap JSON string | legacy düz metin | null). */
  description: string | null;
  /** Çağıran board `member+` mi — `false` ise alt bileşenler salt-okunur. */
  canEdit: boolean;
  /** Checklist verisi — board sorgusundan akar. */
  checklists: Checklists;
  /** Checklist sorgusu hata verdi mi? */
  checklistsError: boolean;
  /** Üst ekranda toplanmış ilerleme (Yapılacaklar sekmesi rozeti). */
  checklistItemsDone: number;
  checklistItemsTotal: number;
};

/**
 * Kart detayında "Açıklama" ve "Yapılacaklar" bölümlerini segmented control
 * altında birleştirir (2026-05-26). Önceden alt alta iki ayrı `DetailSection`
 * idi; mobil dik kaydırmayı kısaltmak için iki içerik tek kart yüzeyine
 * taşındı. Yapılacaklar sekmesi başlığında `done/total` rozeti — boş listede
 * gizli.
 *
 * Alt bileşenler kendilerini `DetailSection` ile sarmaz — bu kapsayıcı tek
 * `bg-card` yüzeyi sağlar (DescriptionEditor refactor aynı tarihli).
 *
 * Faz 15C.9 (2026-05-31 2. tur) — iPad'de 3 sekme + default `'both'`:
 * - **Tablet (≥768px):** `[Tümü] [Açıklama] [Yapılacaklar]`, default `'both'`.
 *   `'both'` modunda `flex-row gap-3` ile sol `DescriptionEditor` + sağ
 *   `ChecklistSection` eşit `flex-1`. Web kart modali (`grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`)
 *   paritesi.
 * - **Phone (<768px):** `[Açıklama] [Yapılacaklar]`, default `'description'`
 *   (mevcut davranış değişmez — `'both'` sekmesi phone'da render edilmez).
 *
 * Detay → [`docs/architecture/13-ui-tasarim-dili.md`](../../../../docs/architecture/13-ui-tasarim-dili.md)
 * §13.12.7 + [`docs/architecture/18-ipad-uyarlamasi.md`](../../../../docs/architecture/18-ipad-uyarlamasi.md) §4.3.
 */
export function DescriptionChecklistTabs({
  cardId,
  description,
  canEdit,
  checklists,
  checklistsError,
  checklistItemsDone,
  checklistItemsTotal,
}: DescriptionChecklistTabsProps) {
  const isTablet = useIsTablet();
  // Tablet'te default `'both'` (web kart modali paritesi); phone'da mevcut
  // davranış `'description'`. Initialize fonksiyonu ilk render'da çağrılır —
  // rotation/Split View V2 sırasında `isTablet` değişirse state korunur (kullanıcı
  // seçimine saygı). İlk render dengesi: SSR yok, `useIsTablet` reactive.
  const [active, setActive] = useState<Tab>(() => (isTablet ? 'both' : 'description'));
  const hasChecklistProgress = checklistItemsTotal > 0;

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-3.5">
      <View className="flex-row gap-1.5 rounded-full bg-muted p-1">
        {/* `'both'` sekmesi yalnız tablet'te görünür — phone'da yan-yana
            yerleşim için yeterli yatay alan yok (mevcut 2-sekme korunur). */}
        {isTablet ? (
          <TabButton
            label={strings.cardDetail.bothTabLabel}
            active={active === 'both'}
            onPress={() => setActive('both')}
          />
        ) : null}
        <TabButton
          label={strings.cardDetail.descriptionTitle}
          active={active === 'description'}
          onPress={() => setActive('description')}
        />
        <TabButton
          label={strings.cardDetail.checklistsTitle}
          badge={hasChecklistProgress ? `${checklistItemsDone}/${checklistItemsTotal}` : undefined}
          active={active === 'checklist'}
          onPress={() => setActive('checklist')}
        />
      </View>

      {active === 'both' ? (
        // Tablet yan-yana: sol açıklama + sağ kontrol listeleri, eşit `flex-1`.
        // Web kart modali (`grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`) düşüncesi
        // — RN flex satır eşdeğeri. iPad mini portrait 768px'te sıkı kalır ama
        // kabul edilir (kullanıcı `'description'` veya `'checklist'` tek-sütun
        // sekmelerine geçebilir).
        <View className="flex-row gap-3">
          <View className="flex-1">
            <DescriptionEditor cardId={cardId} description={description} canEdit={canEdit} />
          </View>
          <View className="flex-1">
            {checklistsError ? (
              <Text className="text-sm text-destructive">{strings.cardDetail.sectionError}</Text>
            ) : (
              <ChecklistSection cardId={cardId} checklists={checklists} canEdit={canEdit} />
            )}
          </View>
        </View>
      ) : active === 'description' ? (
        <DescriptionEditor cardId={cardId} description={description} canEdit={canEdit} />
      ) : checklistsError ? (
        <Text className="text-sm text-destructive">{strings.cardDetail.sectionError}</Text>
      ) : (
        <ChecklistSection cardId={cardId} checklists={checklists} canEdit={canEdit} />
      )}
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
  badge,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  badge?: string;
}) {
  const theme = themeFor(useColorScheme());
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      className={`min-h-9 flex-1 flex-row items-center justify-center gap-1.5 rounded-full px-3 ${
        active ? 'bg-card shadow-sm' : 'active:opacity-70'
      }`}
    >
      <Text
        weight={active ? 'semibold' : 'medium'}
        className={`text-sm ${active ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {label}
      </Text>
      {badge ? (
        <View
          className={`rounded-full px-1.5 py-0.5 ${
            active ? 'bg-muted' : 'bg-card'
          }`}
          style={{ borderColor: theme.border, borderWidth: active ? 0 : 1 }}
        >
          <Text
            weight="medium"
            className={`text-[11px] ${active ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
