import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';

type SettingsGroupProps = {
  /** Grubun üstündeki başlık (opsiyonel — örn. "Görünüm"). */
  title?: string;
  children: ReactNode;
};

/**
 * Hesap / ayar ekranında bir grup `SettingsRow`'u saran kart (DEM-208).
 * `bg-card` yuvarlatılmış kapsayıcı; satırlar arasına ince ayraç çizgisi
 * koyar (grup kenarlığıyla çakışan çift çizgi olmaması için ayraç yalnız
 * satırlar arasında).
 */
export function SettingsGroup({ title, children }: SettingsGroupProps) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View className="gap-2">
      {title ? (
        <Text weight="semibold" className="px-1 text-xs uppercase text-muted-foreground">
          {title}
        </Text>
      ) : null}
      <View className="overflow-hidden rounded-xl border border-border bg-card">
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index > 0 ? <View className="h-px bg-border" /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}
