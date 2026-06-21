import { useEffect, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { SettingsRow } from '@/components/notifications/settings-section';
import { Text } from '@/components/text';
import { Toggle } from '@/components/toggle';
import {
  QUIET_HOURS_DEFAULT_FROM,
  QUIET_HOURS_DEFAULT_TIMEZONE,
  QUIET_HOURS_DEFAULT_TO,
  hasQuietWindow,
  resolveQuietHours,
} from '@/lib/quiet-hours';
import type { GlobalPreferenceFields } from '@/lib/use-notification-preferences';
import { strings } from '@/lib/strings';
import { defaultFontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

type NotificationQuietHoursProps = {
  /** Mevcut global tercih (`preferences.get`) — quiet-hours alanlarını taşır. */
  preference: GlobalPreferenceFields;
  /** Quiet-hours dışındaki kanal/mute alanlarını ezmeden tam satırı yazar. */
  onSave: (next: Pick<GlobalPreferenceFields, 'quietFrom' | 'quietTo' | 'quietTimezone'>) => void;
  disabled: boolean;
};

/**
 * Bildirim ayar ekranı "Sessiz saatler" bölümü (Faz 7K).
 *
 * Global tercih satırına `quietFrom`/`quietTo`/`quietTimezone` üçlüsünü yazar.
 * Toggle kapalıyken üçlü `null`; açıkken `HH:MM` metin girişi (pragmatik —
 * yeni native dep eklemeden, kullanıcı kararı: `@react-native-community/
 * datetimepicker` yok). Saat doğrulaması `quiet-hours.ts`'te (birim test).
 *
 * Zaman dilimi mobil MVP'de düzenlenmez — varsayılan/önceki değer korunur;
 * tam IANA seçici ileri faz işidir.
 */
export function NotificationQuietHours({
  preference,
  onSave,
  disabled,
}: NotificationQuietHoursProps) {
  const theme = useTheme();
  const copy = strings.notificationSettings.quiet;
  const windowActive = hasQuietWindow(preference);

  // Yerel metin state — backend gelene kadar kullanıcı yazarken tutarlı kalsın.
  const [from, setFrom] = useState(preference.quietFrom ?? QUIET_HOURS_DEFAULT_FROM);
  const [to, setTo] = useState(preference.quietTo ?? QUIET_HOURS_DEFAULT_TO);

  useEffect(() => {
    if (preference.quietFrom) setFrom(preference.quietFrom);
    if (preference.quietTo) setTo(preference.quietTo);
  }, [preference.quietFrom, preference.quietTo]);

  const timezone = preference.quietTimezone ?? QUIET_HOURS_DEFAULT_TIMEZONE;

  /**
   * Bir taslağı doğrular; geçerliyse kaydeder, değilse uyarı gösterir ve
   * yerel `from`/`to` state'ini son geçerli değere (tercih satırından) geri
   * alır — geçersiz değer girişte takılı kalıp preview'i bozmasın.
   */
  const commit = (draft: { enabled: boolean; from: string; to: string }) => {
    const result = resolveQuietHours({ ...draft, timezone });
    if (!result.ok) {
      Alert.alert(
        strings.common.errorTitle,
        result.error === 'invalidTime' ? copy.invalidTime : copy.invalidWindow,
      );
      setFrom(preference.quietFrom ?? QUIET_HOURS_DEFAULT_FROM);
      setTo(preference.quietTo ?? QUIET_HOURS_DEFAULT_TO);
      return;
    }
    onSave({
      quietFrom: result.quietFrom,
      quietTo: result.quietTo,
      quietTimezone: result.quietTimezone,
    });
  };

  const handleToggle = (value: boolean) => {
    if (value) {
      const nextFrom = preference.quietFrom ?? QUIET_HOURS_DEFAULT_FROM;
      const nextTo = preference.quietTo ?? QUIET_HOURS_DEFAULT_TO;
      setFrom(nextFrom);
      setTo(nextTo);
      commit({ enabled: true, from: nextFrom, to: nextTo });
    } else {
      commit({ enabled: false, from, to });
    }
  };

  return (
    <View className="gap-3">
      <SettingsRow
        label={copy.toggleLabel}
        control={
          <Toggle
            value={windowActive}
            onValueChange={handleToggle}
            disabled={disabled}
            accessibilityLabel={copy.toggleLabel}
          />
        }
      />

      {windowActive ? (
        <View className="gap-3">
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1">
              <Text weight="medium" className="text-xs text-muted-foreground">
                {copy.from}
              </Text>
              <TextInput
                value={from}
                onChangeText={setFrom}
                onBlur={() => commit({ enabled: true, from, to })}
                editable={!disabled}
                placeholder={copy.timePlaceholder}
                placeholderTextColor={theme.mutedForeground}
                selectionColor={theme.primary}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                style={{ fontFamily: defaultFontFamily }}
                className="h-11 rounded-lg border border-border bg-background px-3 text-base text-foreground"
              />
            </View>
            <View className="flex-1 gap-1">
              <Text weight="medium" className="text-xs text-muted-foreground">
                {copy.to}
              </Text>
              <TextInput
                value={to}
                onChangeText={setTo}
                onBlur={() => commit({ enabled: true, from, to })}
                editable={!disabled}
                placeholder={copy.timePlaceholder}
                placeholderTextColor={theme.mutedForeground}
                selectionColor={theme.primary}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                style={{ fontFamily: defaultFontFamily }}
                className="h-11 rounded-lg border border-border bg-background px-3 text-base text-foreground"
              />
            </View>
          </View>
          <Text className="text-xs text-muted-foreground">
            {copy.preview(from, to)} · {timezone}
          </Text>
          <Text className="text-xs text-muted-foreground">{copy.bypassNote}</Text>
        </View>
      ) : null}
    </View>
  );
}
