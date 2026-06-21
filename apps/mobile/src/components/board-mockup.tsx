import { View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { useIsTablet } from '@/lib/use-device-class';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';
import { paletteColors, type themeFor } from '@/theme/tokens';

/**
 * Giriş ekranı dekoratif mini kanban önizlemesi — web `/sign-in`
 * `board-mockup.tsx`'in mobil karşılığı. Ürünü "anlatan" statik bir pano
 * taklididir; gerçek board bileşeni DEĞİL, gerçek veri taşımaz.
 *
 * Tamamen süstür: blok ekran okuyuculara gizli (`accessibilityElementsHidden` +
 * `importantForAccessibility`), etkileşim almaz (`pointerEvents="none"`). İçerik
 * {@link strings.auth.landing.boardMockup}'tan gelir. Renkler token türevidir
 * (`themeFor`, `paletteColors`) — inline sabit renk yok.
 *
 * Açılışta kolonlar sırayla yumuşak yükselir (Reanimated layout animation);
 * `prefers-reduced-motion` açıksa ({@link useReducedMotion}) statik görünür.
 * Animasyonlu kolonlar `Animated.View` olarak yalnız `style` ile sürülür
 * (className değil — mobilde cssInterop üretimde kayıtlı değil).
 */

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Kart etiket bandı / avatar tonu — `paletteColors` (web `--palet-*`). */
type LabelTone = keyof typeof paletteColors;

type MockCard = {
  title: string;
  labels: LabelTone[];
  avatars?: number;
  due?: boolean;
  checklist?: string;
};

type MockColumn = {
  title: string;
  cards: MockCard[];
};

/** Dekoratif içerik — kolon adları + kart başlıkları `strings`'ten gelir. */
function buildColumns(): MockColumn[] {
  const copy = strings.auth.landing.boardMockup.columns;
  return [
    {
      title: copy.todo.title,
      cards: [
        { title: copy.todo.cards.first, labels: ['mavi'], avatars: 2, due: true },
        { title: copy.todo.cards.second, labels: ['turuncu', 'sky'], avatars: 1 },
      ],
    },
    {
      title: copy.inProgress.title,
      cards: [
        { title: copy.inProgress.cards.first, labels: ['mor', 'pembe'], avatars: 3, checklist: '2/5' },
        { title: copy.inProgress.cards.second, labels: ['sky'], avatars: 1, due: true },
        { title: copy.inProgress.cards.third, labels: ['turuncu'] },
      ],
    },
    {
      title: copy.done.title,
      cards: [
        { title: copy.done.cards.first, labels: ['yesil'], avatars: 2, checklist: '4/4' },
        { title: copy.done.cards.second, labels: ['yesil', 'lime'], avatars: 1 },
      ],
    },
  ];
}

/** Üst üste binen küçük avatar daireleri — saf süs. */
function MockAvatars({
  count,
  theme,
}: {
  count: number;
  theme: ReturnType<typeof themeFor>;
}) {
  return (
    <View className="flex-row" style={{ marginLeft: 'auto' }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: theme.muted,
            borderWidth: 1.5,
            borderColor: theme.card,
            marginLeft: i === 0 ? 0 : -5,
          }}
        />
      ))}
    </View>
  );
}

function MockCardItem({ card, theme }: { card: MockCard; theme: ReturnType<typeof themeFor> }) {
  const hasMeta = card.due || card.checklist || (card.avatars ?? 0) > 0;

  return (
    <View
      style={{
        backgroundColor: theme.card,
        borderRadius: 8,
        padding: 8,
        shadowColor: theme.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.5,
        shadowRadius: 2,
        elevation: 1,
      }}
    >
      {/* Etiket bandı — kapak görseli yokken kartın "rengini" verir. */}
      <View className="mb-1.5 flex-row flex-wrap gap-1">
        {card.labels.map((tone, i) => (
          <View
            key={i}
            style={{ height: 5, width: 28, borderRadius: 3, backgroundColor: paletteColors[tone] }}
          />
        ))}
      </View>

      <Text weight="medium" className="text-[11px] leading-snug text-card-foreground">
        {card.title}
      </Text>

      {hasMeta ? (
        <View className="mt-1.5 flex-row items-center gap-1.5">
          {card.due ? <Icon name="calendar" size={11} color={theme.mutedForeground} /> : null}
          {card.checklist ? (
            <View className="flex-row items-center gap-0.5">
              <Icon name="check-square" size={11} color={theme.mutedForeground} />
              <Text className="text-[10px] text-muted-foreground">{card.checklist}</Text>
            </View>
          ) : null}
          {(card.avatars ?? 0) > 0 ? (
            <MockAvatars count={card.avatars ?? 0} theme={theme} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function BoardMockup() {
  const reduceMotion = useReducedMotion();
  const theme = useTheme();
  const isTablet = useIsTablet();
  const columns = buildColumns();
  // Tablette kolonlar genişler — iki kolon landing düzeninde tam genişliği
  // kullanır; telefonda dar tutulur (ekrana sığması için).
  const columnWidth = isTablet ? 208 : 116;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="flex-row justify-center gap-2.5"
    >
      {columns.map((column, columnIndex) => (
        <Animated.View
          key={column.title}
          entering={
            reduceMotion ? undefined : FadeInDown.delay(120 + columnIndex * 90).duration(420)
          }
          style={{
            width: columnWidth,
            backgroundColor: hexToRgba(theme.muted, 0.55),
            borderWidth: 1,
            borderColor: hexToRgba(theme.border, 0.5),
            borderRadius: 12,
            padding: 8,
          }}
        >
          {/* Kolon başlığı + kart sayısı. */}
          <View className="mb-2 flex-row items-center justify-between px-0.5">
            <Text weight="semibold" className="text-xs text-foreground">
              {column.title}
            </Text>
            <Text className="text-[11px] text-muted-foreground">{column.cards.length}</Text>
          </View>

          <View className="gap-1.5">
            {column.cards.map((card) => (
              <MockCardItem key={card.title} card={card} theme={theme} />
            ))}
          </View>
        </Animated.View>
      ))}
    </View>
  );
}
