import { Pressable, View, useColorScheme } from 'react-native';
import { Icon, type IconName } from '@/components/icon';
import type { BoardViewMode } from '@/lib/board-view-preference';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type BoardViewToggleProps = {
  /** Aktif görünüm modu. */
  mode: BoardViewMode;
  /** Segment seçilince çağrılır — aynı moda dokunmak da çağırır (idempotent). */
  onChange: (mode: BoardViewMode) => void;
};

type SegmentProps = {
  icon: IconName;
  accessibilityLabel: string;
  active: boolean;
  activeColor: string;
  mutedColor: string;
  onPress: () => void;
};

/** Tek segment — aktifken `bg-card` ile doldurulur, pasifken nötr. */
function Segment({
  icon,
  accessibilityLabel,
  active,
  activeColor,
  mutedColor,
  onPress,
}: SegmentProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      hitSlop={6}
      onPress={onPress}
      className={`items-center justify-center rounded px-2 py-1 ${
        active ? 'bg-card' : 'active:opacity-60'
      }`}
    >
      <Icon name={icon} size={16} color={active ? activeColor : mutedColor} />
    </Pressable>
  );
}

/**
 * Board görünüm modu segmented control (DEM-233) — board ekranı header'ında,
 * mevcut filtre/arama/üye/⋮ butonlarının yanında **ikon-only** mini segment.
 * Kanban kolon görünümü (`columns`) ve dikey liste görünümü (`list`); aktif
 * segment doldurulmuş. Erişilebilirlik etiketleri `strings.board.view.*`'ten
 * okunur (görünür metin yok — dar header'a sığsın diye, kullanıcı kararı
 * 2026-05-20).
 */
export function BoardViewToggle({ mode, onChange }: BoardViewToggleProps) {
  const theme = themeFor(useColorScheme());
  return (
    <View className="flex-row gap-0.5 self-start rounded-md bg-muted p-0.5">
      <Segment
        icon="columns"
        accessibilityLabel={strings.board.view.kanban}
        active={mode === 'kanban'}
        activeColor={theme.foreground}
        mutedColor={theme.mutedForeground}
        onPress={() => onChange('kanban')}
      />
      <Segment
        icon="list"
        accessibilityLabel={strings.board.view.list}
        active={mode === 'list'}
        activeColor={theme.foreground}
        mutedColor={theme.mutedForeground}
        onPress={() => onChange('list')}
      />
    </View>
  );
}
