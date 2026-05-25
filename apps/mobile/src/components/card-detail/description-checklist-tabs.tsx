import { useState } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import type { RouterOutputs } from '@pusula/api';
import { Text } from '@/components/text';
import { DescriptionEditor } from '@/components/card-detail/description-editor';
import { ChecklistSection } from '@/components/card-detail/checklist-section';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type Checklists = RouterOutputs['checklist']['list'];

type Tab = 'description' | 'checklist';

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
 * taşındı. Varsayılan sekme `description`. Yapılacaklar sekmesi başlığında
 * `done/total` rozeti — boş listede gizli.
 *
 * Alt bileşenler kendilerini `DetailSection` ile sarmaz — bu kapsayıcı tek
 * `bg-card` yüzeyi sağlar (DescriptionEditor refactor aynı tarihli).
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
  const [active, setActive] = useState<Tab>('description');
  const hasChecklistProgress = checklistItemsTotal > 0;

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-3.5">
      <View className="flex-row gap-1.5 rounded-full bg-muted p-1">
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

      {active === 'description' ? (
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
