import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';

type SettingsSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

/**
 * Bildirim ayar ekranı bölüm kabuğu (Faz 7K) — başlık + açıklama + içerik
 * kartı. Tüm bölümler (kanallar, matris, kapsam, sessiz saatler, cihazlar)
 * tutarlı görünsün diye ortak sarmalayıcı.
 */
export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <View className="gap-2">
      <View className="gap-0.5">
        <Text weight="semibold" className="text-base text-foreground">
          {title}
        </Text>
        {description ? (
          <Text className="text-xs text-muted-foreground">{description}</Text>
        ) : null}
      </View>
      <View className="gap-3 rounded-xl border border-border bg-card p-3">{children}</View>
    </View>
  );
}

type SettingsRowProps = {
  label: string;
  hint?: string;
  /** Sağ tarafta gösterilen kontrol (Toggle, metin vb.). */
  control: ReactNode;
};

/** Bir ayar satırı — sol etiket (+ ipucu), sağ kontrol. */
export function SettingsRow({ label, hint, control }: SettingsRowProps) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="flex-1 gap-0.5">
        <Text className="text-sm text-foreground">{label}</Text>
        {hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
      </View>
      {control}
    </View>
  );
}
